# =============================================================================
# S3 bucket for ALB access logs
# =============================================================================
# Stores per-request access logs from the public ALB (aws_lb.main) for
# forensic / incident-response work. ALB writes one gzipped log file every
# 5 minutes (or 1MB) containing per-request rows (timestamp, client_ip,
# elb_status_code, target_status_code, request_processing_time, request_url,
# user_agent, ...). Without these logs we cannot do per-IP, per-path, or
# per-User-Agent attribution after the fact, which has already blocked three
# incident investigations (Tue 12:25 scanner, Fri 17:13 storm, Sat 03:16
# burst).
#
# Configuration constraints (all enforced by AWS):
#   * Bucket region MUST equal the ALB region (us-east-1).
#   * Server-side encryption MUST be SSE-S3 (AES256) or SSE-KMS with the
#     default `aws/s3` key. Customer-managed KMS keys are NOT supported by
#     ALB access logs and cause silent log delivery failures.
#   * Bucket policy MUST grant s3:PutObject to the regional ELB service
#     account principal (NOT delivery.logs.amazonaws.com). The principal
#     ARN is region-specific; we use the data source for portability.
#
# Cost: ~20 MB/day of compressed logs at current traffic (~$0.50/month
# including STANDARD_IA transition after 30d, expiration after 90d).
#
# Athena query patterns documented in ALB_ACCESS_LOGS.md.
# =============================================================================

# -----------------------------------------------------------------------------
# Regional ELB service-account principal for the access-logs bucket policy.
# For us-east-1 this resolves to arn:aws:iam::127311923021:root. Using the
# data source instead of hardcoding lets the same code be reused if the ALB
# is ever migrated to a different region.
# -----------------------------------------------------------------------------

data "aws_elb_service_account" "main" {}

# Account ID lookup, gated with count so we don't collide with the
# conditionally-created data source in cloudfront.tf. The policy needs the
# account_id to scope the resource ARN to AWSLogs/<account_id>/*.
data "aws_caller_identity" "alb_logs" {}

# -----------------------------------------------------------------------------
# The bucket itself.
#
# Name choice: hardcoded `coasty-alb-access-logs-us-east-1` rather than
# templated with var.project_name because:
#   (a) bucket names must be globally unique, and a stable forensic name
#       outlives the internal project codename.
#   (b) it matches the rollback / IR runbook (ALB_ACCESS_LOGS.md) which
#       references the name verbatim.
#
# force_destroy = false: forensic logs MUST NOT be deleted by a stray
# `terraform destroy`. Bucket can only be emptied by an explicit operator
# action.
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "alb_access_logs" {
  bucket        = "coasty-alb-access-logs-${var.aws_region}"
  force_destroy = false

  tags = { Name = "${var.project_name}-alb-access-logs" }
}

# Block all forms of public access. Access-log buckets are never read via
# anonymous HTTP; Athena queries it via the S3 API with IAM credentials.
resource "aws_s3_bucket_public_access_block" "alb_access_logs" {
  bucket = aws_s3_bucket.alb_access_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Ownership controls: BucketOwnerEnforced (the post-April-2023 S3 default).
# ACLs are disabled; the bucket owner automatically owns every uploaded
# object. We declare this explicitly to (a) document intent and (b) keep
# the apply idempotent if AWS ever changes the default again.
#
# CRITICAL INTERACTION with the bucket policy below: because ACLs are
# disabled, the policy MUST NOT contain a Condition on `s3:x-amz-acl`. If
# it does, ALB log-delivery requests send the canned ACL header, S3 strips
# it (ACLs disabled), the StringEquals condition no longer matches, and
# every PutObject returns 403 AccessDenied. This is the bug that bricked
# the 2026-05-25 apply.
resource "aws_s3_bucket_ownership_controls" "alb_access_logs" {
  bucket = aws_s3_bucket.alb_access_logs.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Server-side encryption: AES256 (SSE-S3).
#
# We deliberately do NOT use a customer-managed KMS key here. AWS ALB access
# log delivery only supports SSE-S3 or the default `aws/s3` SSE-KMS key. A
# customer KMS key produces no error at apply time but causes log delivery
# to silently drop, which would defeat the entire purpose of this work.
resource "aws_s3_bucket_server_side_encryption_configuration" "alb_access_logs" {
  bucket = aws_s3_bucket.alb_access_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Lifecycle: cool storage after 30 days, expiration at retention boundary.
# Most forensic queries look at the trailing 7-14 days; the 30-90 day window
# exists to support post-mortem timelines and compliance retention. After
# 90 days, the cost of keeping the logs typically exceeds their utility.
resource "aws_s3_bucket_lifecycle_configuration" "alb_access_logs" {
  bucket = aws_s3_bucket.alb_access_logs.id

  rule {
    id     = "transition-and-expire"
    status = "Enabled"

    filter {}

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    expiration {
      days = var.alb_access_logs_retention_days
    }

    # Defensive: if a multipart upload from ALB's log delivery ever stalls,
    # abort and reclaim storage rather than letting the part charges pile up.
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# -----------------------------------------------------------------------------
# Bucket policy: allow the regional ELB service account to write logs.
#
# Two statements:
#   1. AllowELBLogDelivery: the actual log-put permission, scoped to the
#      AWSLogs/<account_id>/* key prefix.
#   2. DenyUnencryptedTransport: HTTPS-only access. ALB delivers logs over
#      HTTPS already; this guards against future API consumers (Athena,
#      ad-hoc aws s3 cp) that might be misconfigured.
#
# The us-east-1 ELB service account is arn:aws:iam::127311923021:root, but
# we use data.aws_elb_service_account.main.arn for region portability.
#
# IMPORTANT history (2026-05-25 incident):
#   * The previous version of this policy included a Condition on
#     `s3:x-amz-acl == bucket-owner-full-control`. Combined with the
#     BucketOwnerEnforced ownership control above, this caused every ALB
#     PutObject to be denied (S3 strips the ACL header when ACLs are
#     disabled, so the StringEquals condition never matched). Fix: drop
#     the condition. With BucketOwnerEnforced the bucket owner already
#     gets ownership of every object — the canned ACL is redundant.
#   * We also dropped AllowGetBucketAcl. Modern ALB access-log delivery
#     does not call GetBucketAcl before writes; the statement was carried
#     over from legacy Classic Load Balancer docs and adds no value.
#   * AWS's current published policy for ALB access logs:
#     https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html#attach-bucket-policy
# -----------------------------------------------------------------------------

resource "aws_s3_bucket_policy" "alb_access_logs" {
  bucket = aws_s3_bucket.alb_access_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowELBLogDelivery"
        Effect = "Allow"
        Principal = {
          AWS = data.aws_elb_service_account.main.arn
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.alb_access_logs.arn}/alb-coasty/AWSLogs/${data.aws_caller_identity.alb_logs.account_id}/*"
      },
      {
        Sid       = "DenyUnencryptedTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.alb_access_logs.arn,
          "${aws_s3_bucket.alb_access_logs.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
    ]
  })

  # Ownership controls must apply first: BucketOwnerEnforced disables ACLs,
  # which is the precondition for the policy NOT carrying an ACL condition.
  # Public-access-block must also be in place before the policy evaluates.
  depends_on = [
    aws_s3_bucket_public_access_block.alb_access_logs,
    aws_s3_bucket_ownership_controls.alb_access_logs,
  ]
}

# -----------------------------------------------------------------------------
# Output the bucket name for the Athena DDL and IR runbooks.
# -----------------------------------------------------------------------------

output "alb_access_logs_bucket" {
  description = "S3 bucket receiving ALB access logs. Athena DDL in ALB_ACCESS_LOGS.md."
  value       = aws_s3_bucket.alb_access_logs.id
}
