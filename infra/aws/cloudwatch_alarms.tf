# =============================================================================
# CloudWatch alarms — paged on-call when the platform is degrading
# =============================================================================
#
# Why this file exists
# --------------------
# Pre-this-file, the account had **zero** alarms with prefix `${var.project_name}-`.
# Three real production incidents in the last 48 hours each happened with NO
# pager fire:
#
#   1. 2026-04-23T03:18Z — frontend hit by 1,040 RPS in 60s, P99 latency
#      53.38s, 970 ELB 5XX (93% error rate at peak).  Self-recovered when
#      the burst ended.  Detected after-the-fact via post-deploy log dive.
#
#   2. 2026-04-24T03:18Z — V8 OOM kill, container died with FATAL ERROR:
#      Reached heap limit.  Detected via post-deploy log dive only.
#
#   3. 2026-04-24T20:45Z — internal-key/service-role auth incident,
#      122 401s + 213 403s for ~23 minutes.  Detected via post-deploy log
#      dive; root cause was likely a rotation that wasn't propagated to
#      every service simultaneously.
#
# This file is the minimum-viable alarm set that would have paged on each
# of those.  All alarms are gated on `var.enable_alarms` (default true) and
# all notify a single SNS topic that subscribers can fan out.
#
# Naming convention
# -----------------
#   `${var.project_name}-<surface>-<metric>-<level>`
#
#   surface ∈ { alb, alb-int, frontend, api, sse, ws, ecs, db }
#   metric  ∈ { 5xx, 4xx, latency, unhealthy, cpu, mem, rejected }
#   level   ∈ { burst, sustained, p99 }   (omit when unambiguous)
#
# Cost
# ----
# CloudWatch alarms are billed per metric × period × month at $0.10/alarm.
# 14 alarms ≈ $1.40/month.  Pager noise has a much higher operational cost
# than that.
#
# Subscribing to the SNS topic
# ----------------------------
# By default we set up an EMAIL subscription IF `var.alarm_email` is given.
# For PagerDuty / Slack / Opsgenie, manually subscribe the topic ARN
# (exposed via the `alarms_sns_topic_arn` output) — the integration is
# outside-of-Terraform so people can rotate URLs without a TF apply.
#
# Disabling for staging
# ---------------------
# Set `enable_alarms = false` in tfvars.  All resources in this file
# evaluate to zero — no SNS topic, no alarms.  Useful when standing up a
# transient staging stack you don't want paging the prod oncall.
# =============================================================================


# -----------------------------------------------------------------------------
# Variables — kept here (not in variables.tf) so the alarm contract lives
# in one file.  Pulled in by Terraform's var-file resolution as usual.
# -----------------------------------------------------------------------------

variable "enable_alarms" {
  description = "Master switch — when false, this whole file produces zero resources."
  type        = bool
  default     = true
}

variable "alarm_email" {
  description = <<-EOT
    Optional email address to subscribe to the alarms SNS topic.  Useful for
    a fail-safe on top of whatever paging integration you wire to the SNS
    topic.  Empty (default) = no email subscription, but the topic still
    exists and can be subscribed to externally.
  EOT
  type        = string
  default     = ""
}

variable "alarm_alb_elb_5xx_burst_threshold" {
  description = "ALB-level 5xx count in 1 min that constitutes a burst (P0)."
  type        = number
  default     = 50
}

variable "alarm_alb_target_5xx_rate_pct" {
  description = "Per-target 5xx rate (%) sustained over 5 min that triggers P1."
  type        = number
  default     = 1
}

variable "alarm_target_response_time_p99_seconds" {
  description = "P99 target latency on the frontend TG (seconds) over 10 min."
  type        = number
  default     = 5
}

variable "alarm_ecs_cpu_pct" {
  description = "ECS service CPUUtilization (%) over 10 min."
  type        = number
  default     = 80
}

variable "alarm_ecs_memory_pct" {
  description = "ECS service MemoryUtilization (%) over 5 min."
  type        = number
  default     = 80
}


# -----------------------------------------------------------------------------
# SNS topic + optional email subscription
# -----------------------------------------------------------------------------

resource "aws_sns_topic" "alarms" {
  count = var.enable_alarms ? 1 : 0
  name  = "${var.project_name}-alarms"
  tags  = { Name = "${var.project_name}-alarms" }
}

resource "aws_sns_topic_subscription" "alarms_email" {
  count     = var.enable_alarms && var.alarm_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}


# -----------------------------------------------------------------------------
# Helper local — list of ARNs to notify on every alarm.  Empty when
# enable_alarms = false so the alarms (also count-gated) never reference a
# non-existent topic.
# -----------------------------------------------------------------------------

locals {
  alarm_actions = var.enable_alarms ? [aws_sns_topic.alarms[0].arn] : []
}


# =============================================================================
# Public ALB alarms
# =============================================================================

# 1. ELB-level 5xx burst — single-datapoint alarm so a 60s spike pages within
#    a minute.  This is the alarm that would have fired on the 23:18Z burst.
resource "aws_cloudwatch_metric_alarm" "alb_elb_5xx_burst" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-alb-elb5xx-burst"
  alarm_description   = "ALB returned >${var.alarm_alb_elb_5xx_burst_threshold} 5xx responses in 1 minute. Likely no healthy targets, target group misconfigured, or upstream task in death spiral."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = var.alarm_alb_elb_5xx_burst_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-alb-elb5xx-burst" }
}

# 2. Target-level 5xx sustained — handlers crashing for >5 min (NOT a brief
#    deploy-cutover blip, since deploys recover in <60 s).  This pages on
#    "your backend is sick" rather than "your ALB is sick".
resource "aws_cloudwatch_metric_alarm" "alb_target_5xx_sustained" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-alb-target5xx-sustained"
  alarm_description   = "Target 5xx count >50 sustained over 5 min — handler crashing. Check backend logs for tracebacks."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 50
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-alb-target5xx-sustained" }
}

# 3. Rejected connection count — ALB hit its connection limit.  Even one is
#    a real symptom; we don't smooth this with evaluation periods.
resource "aws_cloudwatch_metric_alarm" "alb_rejected_connections" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-alb-rejected-connections"
  alarm_description   = "ALB rejected at least one connection due to its capacity limit. Investigate scale-out and connection draining behaviour."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "RejectedConnectionCount"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-alb-rejected-connections" }
}


# =============================================================================
# Per-target-group health
# =============================================================================
#
# UnHealthyHostCount is published per (TG × ALB).  We alarm on each TG that
# user-visible traffic depends on.  Internal-ALB and SSE TGs are tolerated
# slightly differently:
#
#   * frontend-tg  : any unhealthy host is bad (1 of 2 = 50% capacity loss)
#   * api/sse/ws-tg: same
#   * sse TGs (latency)   : NO P99 alarm — SSE streams are long-lived, P99
#                           latency is naturally 10–30 s for time-to-first-
#                           chunk.  Alarming would page constantly.
#   * frontend-tg (latency): P99 > 5s for 10min indicates queue overflow,
#                            same surface as the 23:18Z incident.
# =============================================================================

resource "aws_cloudwatch_metric_alarm" "frontend_unhealthy" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-frontend-unhealthy"
  alarm_description   = "Frontend TG has at least one unhealthy host for 5 min. Check ECS task health + recent deploys."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.frontend.arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-frontend-unhealthy" }
}

#
# 2026-05-23 retune: gate the alarm on RequestCount >= 30 via metric math.
# Pre-tune state (8 of 10 minutes above threshold) flapped on Friday 00:51 UTC
# when p99 peaked at 6.126 s with only 62 requests in the window. A single
# slow sample dominates p99 in low-traffic buckets, making the raw p99
# statistically meaningless. The IF(reqs >= 30, p99latency, 0) gate zeroes
# the metric out below 30 req/min so the alarm only evaluates statistically
# meaningful p99 values.
#
# Also relaxed 8-of-10 to 5-of-10: with low-traffic samples filtered out, a
# tighter 5-of-10 is appropriate for the remaining real signal.
resource "aws_cloudwatch_metric_alarm" "frontend_p99_latency" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-frontend-p99-latency"
  alarm_description   = "Frontend p99 > ${var.alarm_target_response_time_p99_seconds}s with at least 30 requests in the bucket. Suppressed when request count is too low to be statistically meaningful (e.g. low-traffic late-night windows that produced the 2026-05-22T00:51Z double-flap)."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 10
  datapoints_to_alarm = 5
  threshold           = var.alarm_target_response_time_p99_seconds
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "p99"
    return_data = true
    expression  = "IF(reqs >= 30, p99latency, 0)"
    label       = "p99 latency (gated on >= 30 req/min)"
  }

  metric_query {
    id = "p99latency"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "TargetResponseTime"
      period      = 60
      stat        = "p99"
      dimensions = {
        TargetGroup  = aws_lb_target_group.frontend.arn_suffix
        LoadBalancer = aws_lb.main.arn_suffix
      }
    }
  }

  metric_query {
    id = "reqs"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      period      = 60
      stat        = "Sum"
      dimensions = {
        TargetGroup  = aws_lb_target_group.frontend.arn_suffix
        LoadBalancer = aws_lb.main.arn_suffix
      }
    }
  }

  # Actions intentionally omitted — paging is routed through
  # aws_cloudwatch_composite_alarm.frontend_p99_any below. This alarm's state
  # is still visible in CloudWatch for post-mortem forensics (which p99 shape
  # fired: sustained vs rolling-slow vs burst). See the composite for the
  # 2026-05-27 dedup rationale.
  tags = { Name = "${var.project_name}-frontend-p99-latency" }
}

# -----------------------------------------------------------------------------
# Rolling-slow p99 alarm (2026-05-23 addition)
#
# Coverage gap closed: master audit timeline found p99 sat at 5-7s for 10
# hours on Thu 16:00 -> Fri 01:00 UTC 2026-05-21/22. NO alarm fired because:
#   * frontend-p99-latency required 8 of 10 consecutive minutes above 5s
#   * frontend-p99-latency-burst required 3 of 5 minutes above 10s
# p99 bounced between 4.2 and 6.8 enough to keep resetting both windows.
# Result: 10 hours of degraded latency with zero pager fire.
#
# This alarm catches that pattern: 10 of 30 minutes above 4s, with the same
# RequestCount >= 30 gating used by frontend-p99-latency. Lower threshold
# (4s vs 5s) because sustained slowness is the concern, not headline peaks.
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "frontend_p99_rolling_slow" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-frontend-p99-rolling-slow"
  alarm_description   = "Frontend p99 > 4s sustained over 10 of 30 minutes (with >= 30 req/min gating). Catches slow-rolling degradation that bypasses 5-of-10 alarms. Closes the hidden 2026-05-21T16:00Z to 2026-05-22T01:00Z 10-hour SLO breach coverage gap."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 30
  datapoints_to_alarm = 10
  threshold           = 4
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "p99"
    return_data = true
    expression  = "IF(reqs >= 30, p99latency, 0)"
    label       = "p99 latency (gated on >= 30 req/min)"
  }

  metric_query {
    id = "p99latency"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "TargetResponseTime"
      period      = 60
      stat        = "p99"
      dimensions = {
        TargetGroup  = aws_lb_target_group.frontend.arn_suffix
        LoadBalancer = aws_lb.main.arn_suffix
      }
    }
  }

  metric_query {
    id = "reqs"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      period      = 60
      stat        = "Sum"
      dimensions = {
        TargetGroup  = aws_lb_target_group.frontend.arn_suffix
        LoadBalancer = aws_lb.main.arn_suffix
      }
    }
  }

  # Actions muted — paging routed through composite (see frontend_p99_any below).
  tags = { Name = "${var.project_name}-frontend-p99-rolling-slow" }
}

# Short-burst p99 alarm — catches the kind of incident the alarm above misses.
#
# 2026-05-02T14:40Z–16:25Z UTC: external ALB p99 hit 55.97 s for 5+ minutes,
# then dropped, then spiked again — six 5-min buckets above 19 s clustered
# in a 105 min window. The alarm above (8 of 10 minutes > threshold) never
# fired because the spikes were short, separated by gaps where p99 fell back
# under threshold.
#
# This companion alarm uses 3-of-5 evaluation at a 10 s threshold so any
# 3-min burst of p99 > 10 s pages oncall — even if p99 drops back to normal
# in between bursts, the cluster is recognised as one incident.
#
# Why two alarms instead of replacing the first: the 8-of-10 alarm above
# catches sustained slowness (gradual degradation), this one catches
# bursty tail latency (intermittent backend hiccups). Both shapes hurt
# users; both deserve separate signals.
#
# 2026-05-23 retune: same RequestCount >= 30 gating as frontend_p99_latency.
# The burst alarm fired 11 times in 7 days, dominated by low-traffic windows
# (e.g. Fri 00:51 UTC: p99 6.126 s with only 62 RequestCount in the bucket).
# Threshold stays at 10 s — the concern is real bursts, not low-traffic noise.
resource "aws_cloudwatch_metric_alarm" "frontend_p99_latency_burst" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-frontend-p99-latency-burst"
  alarm_description   = "Frontend p99 > 10s for 3 of 5 minutes (burst-pattern detector) with >= 30 req/min gating. Catches short tail-latency clusters the sustained alarm misses (e.g. 2026-05-02T14:40-16:25Z had p99=55.97s in scattered buckets but only 6 of 105 min total). Gating eliminates the 2026-05-22T00:51Z low-traffic false-flap class."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  threshold           = 10
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "p99"
    return_data = true
    expression  = "IF(reqs >= 30, p99latency, 0)"
    label       = "p99 latency (gated on >= 30 req/min)"
  }

  metric_query {
    id = "p99latency"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "TargetResponseTime"
      period      = 60
      stat        = "p99"
      dimensions = {
        TargetGroup  = aws_lb_target_group.frontend.arn_suffix
        LoadBalancer = aws_lb.main.arn_suffix
      }
    }
  }

  metric_query {
    id = "reqs"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      period      = 60
      stat        = "Sum"
      dimensions = {
        TargetGroup  = aws_lb_target_group.frontend.arn_suffix
        LoadBalancer = aws_lb.main.arn_suffix
      }
    }
  }

  # Actions muted — paging routed through composite (see frontend_p99_any below).
  tags = { Name = "${var.project_name}-frontend-p99-latency-burst" }
}

# -----------------------------------------------------------------------------
# Composite alarm: frontend p99 — single pager fire across all three shapes
#
# Context (2026-05-27 dedup)
# --------------------------
# The three frontend p99 alarms above (sustained, rolling-slow, burst) each
# catch a distinct degradation shape and they SHOULD continue to exist as
# independent detectors. But the 2026-05-26 06:24 UTC spike paged on-call
# twice (rolling-slow at 06:24Z, latency at 06:28Z) for what was one
# underlying incident — alert fatigue.
#
# Fix: keep the three detectors, but mute their individual SNS actions and
# route paging through this composite OR alarm instead. One incident now
# produces exactly one page and one OK notification regardless of how many
# shape-detectors trip.
#
# Post-mortem forensics still work: each underlying alarm's state and history
# are visible in CloudWatch, so you can see whether the incident manifested
# as a burst (>10s for 3 of 5 min), a sustained spike (>5s for 5 of 10 min),
# or slow-rolling latency (>4s for 10 of 30 min) — or all three.
#
# Why composite (not metric-math merge): each detector has different
# evaluation windows (5/10/30 min) and thresholds (10/5/4 s). A single math
# expression cannot reproduce that without losing the per-shape signal.
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_composite_alarm" "frontend_p99_any" {
  count             = var.enable_alarms ? 1 : 0
  alarm_name        = "${var.project_name}-frontend-p99-any"
  alarm_description = "Frontend p99 latency degraded (any of: burst >10s/3min, sustained >5s/5-of-10min, rolling-slow >4s/10-of-30min). De-duplicates the three underlying shape-detectors so one incident pages exactly once. Check the individual member alarms in CloudWatch to identify which latency shape fired."

  alarm_rule = join(" OR ", [
    "ALARM(\"${aws_cloudwatch_metric_alarm.frontend_p99_latency[0].alarm_name}\")",
    "ALARM(\"${aws_cloudwatch_metric_alarm.frontend_p99_rolling_slow[0].alarm_name}\")",
    "ALARM(\"${aws_cloudwatch_metric_alarm.frontend_p99_latency_burst[0].alarm_name}\")",
  ])

  actions_enabled = true
  alarm_actions   = local.alarm_actions
  ok_actions      = local.alarm_actions

  tags = { Name = "${var.project_name}-frontend-p99-any" }
}

# -----------------------------------------------------------------------------
# Frontend RequestCountPerTarget overload alarm (2026-05-27 addition)
#
# Context
# -------
# `aws_appautoscaling_policy.request_count` in ecs.tf targets 200 req/min/
# target on `ALBRequestCountPerTarget` for the frontend `app` service.
# AppAutoScaling creates its own pair of CloudWatch alarms internally
# (TargetTracking-...-AlarmHigh / -AlarmLow). Those alarms are managed by
# the autoscaling service and do not page on-call directly — they only
# drive scale-out/in.
#
# The 2026-05-25 → 2026-05-27 audit observed steady-state 771 req/min/
# target with peaks of 2180 and ZERO scale-out events firing. That means
# either:
#   (a) The internal AppAutoScaling AlarmHigh is in INSUFFICIENT_DATA
#       (e.g. the ResourceLabel points at a TG that no longer carries the
#       service's traffic), so it never fires.
#   (b) max_capacity has been hit and scaling cannot help — the workload
#       is genuinely larger than provisioned headroom.
# Either way, sustained req/min/target ≫ the autoscale target is the
# critical condition we want to page on, because it means user-facing
# traffic is queuing on tasks that scaling did not save us from.
#
# Threshold rationale
# -------------------
# - Autoscale target: 200 req/min/target (var.request_count_per_target_target).
# - Critical alarm at 5x that target sustained for 5 min — well above
#   typical bursts AND above the autoscale's correction zone, so it
#   ONLY fires when scaling has demonstrably failed to keep up.
# - Math expression with a min-request gate (>= 30 req/min total at the
#   TG) prevents low-traffic windows from producing meaningless ratios
#   (matches the gating pattern used on the frontend p99 alarms).
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "frontend_request_count_overload" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-frontend-request-overload"
  alarm_description   = "Frontend req/min/target > 1000 (5x autoscale target) sustained 5 min with >= 30 req/min in window. Means AppAutoScaling has failed to keep up (either AlarmHigh in INSUFFICIENT_DATA or max_capacity exhausted). User-facing traffic is queuing. Investigate AppAutoScaling state + max_capacity headroom."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  threshold           = 1000
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "rpt"
    return_data = true
    expression  = "IF(reqs >= 30, rpt_raw, 0)"
    label       = "req/min/target (gated on >= 30 req/min total)"
  }

  metric_query {
    id = "rpt_raw"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCountPerTarget"
      period      = 60
      stat        = "Sum"
      dimensions = {
        TargetGroup = aws_lb_target_group.frontend.arn_suffix
      }
    }
  }

  metric_query {
    id = "reqs"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      period      = 60
      stat        = "Sum"
      dimensions = {
        TargetGroup  = aws_lb_target_group.frontend.arn_suffix
        LoadBalancer = aws_lb.main.arn_suffix
      }
    }
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-frontend-request-overload"
    Severity = "P1"
  })
}

# Equivalent burst-pattern p99 alarms for the api / sse / ws split target
# groups. Yesterday's 14:40-16:25Z incident was DRIVEN by the api/sse path
# (Bedrock-side flakiness on a single user's CUA chat session), so the
# internal ALB target groups need the same coverage as the public ALB.
resource "aws_cloudwatch_metric_alarm" "api_p99_latency_burst" {
  count               = var.enable_alarms && var.three_service_split_enabled ? 1 : 0
  alarm_name          = "${var.project_name}-api-p99-latency-burst"
  alarm_description   = "API P99 latency >10s for 3 of 5 minutes. Catches Bedrock-side tail latency."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p99"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.api[0].arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-api-p99-latency-burst" }
}

resource "aws_cloudwatch_metric_alarm" "sse_p99_latency_burst" {
  count      = var.enable_alarms && var.three_service_split_enabled ? 1 : 0
  alarm_name = "${var.project_name}-sse-p99-latency-burst"
  # SSE serves long-poll/streaming chat endpoints where multi-second p99 is
  # NORMAL (a 30-second chat response is fine). Threshold raised to 30 s so
  # the alarm only fires on genuinely-stuck streams, not healthy long ones.
  alarm_description   = "SSE P99 latency >30s for 3 of 5 minutes. Threshold raised vs api/ws because SSE chat streaming naturally has multi-second p99."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p99"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  threshold           = 30
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.sse[0].arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-sse-p99-latency-burst" }
}

resource "aws_cloudwatch_metric_alarm" "ws_p99_latency_burst" {
  count      = var.enable_alarms && var.three_service_split_enabled ? 1 : 0
  alarm_name = "${var.project_name}-ws-p99-latency-burst"
  # WS handshake is fast (it upgrades and the connection lives in the
  # backend, not the ALB latency path). p99 should stay <2 s easily.
  alarm_description   = "WS P99 latency >5s for 3 of 5 minutes. WS handshake is fast (<1s typical); >5s indicates backend stall during register_owner."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p99"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.ws[0].arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-ws-p99-latency-burst" }
}

# Split-service TG health alarms — only created when the split is enabled.
resource "aws_cloudwatch_metric_alarm" "api_unhealthy" {
  count               = var.enable_alarms && var.three_service_split_enabled ? 1 : 0
  alarm_name          = "${var.project_name}-api-unhealthy"
  alarm_description   = "api-tg has unhealthy host for 5 min. Backend API service degraded."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.api[0].arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-api-unhealthy" }
}

resource "aws_cloudwatch_metric_alarm" "sse_unhealthy" {
  count               = var.enable_alarms && var.three_service_split_enabled ? 1 : 0
  alarm_name          = "${var.project_name}-sse-unhealthy"
  alarm_description   = "sse-tg has unhealthy host for 5 min. Streaming service degraded — chat will fail."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.sse[0].arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-sse-unhealthy" }
}

resource "aws_cloudwatch_metric_alarm" "ws_unhealthy" {
  count               = var.enable_alarms && var.three_service_split_enabled ? 1 : 0
  alarm_name          = "${var.project_name}-ws-unhealthy"
  alarm_description   = "ws-tg has unhealthy host for 5 min. Electron desktop app cannot connect."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.ws[0].arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-ws-unhealthy" }
}


# =============================================================================
# ECS service alarms (CPU / memory)
# =============================================================================
#
# Memory is the more important one because the V8 OOM kill that took down a
# frontend container at 03:18:36Z 04-24 manifested as `MemoryUtilization`
# climbing past 90% before the kernel killed it.  We alarm on >80% sustained
# for 5 min — that gives ops a window to investigate before the OOM happens.
#
# CPU >80% for 10 min is the late-arriving signal that backstops the
# RequestCountPerTarget autoscaling policy: if traffic has spiked past what
# autoscale can keep up with, CPU pegs.
# =============================================================================

resource "aws_cloudwatch_metric_alarm" "frontend_memory" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-frontend-memory"
  alarm_description   = "Frontend ECS service MemoryUtilization >${var.alarm_ecs_memory_pct}% for 5 min. Likely a memory leak or oversized request — capture a heap snapshot via SIGUSR2 before the V8 OOM kills the task."
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  threshold           = var.alarm_ecs_memory_pct
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-frontend-memory" }
}

resource "aws_cloudwatch_metric_alarm" "frontend_cpu" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-frontend-cpu"
  alarm_description   = "Frontend ECS service CPUUtilization >${var.alarm_ecs_cpu_pct}% for 10 min. RequestCountPerTarget autoscaling should have kicked in already — this fires only if autoscaling is broken or capped at max_capacity."
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 10
  datapoints_to_alarm = 8
  threshold           = var.alarm_ecs_cpu_pct
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-frontend-cpu" }
}

# Split-service CPU/Memory alarms — created on the same flag gate as the
# split itself, otherwise the service references resolve to count=0 and
# Terraform errors at plan time.
resource "aws_cloudwatch_metric_alarm" "split_service_memory" {
  for_each = var.enable_alarms && var.three_service_split_enabled ? toset(["api", "sse", "ws"]) : toset([])

  alarm_name          = "${var.project_name}-${each.key}-memory"
  alarm_description   = "${each.key} ECS service MemoryUtilization >${var.alarm_ecs_memory_pct}% for 5 min. SSE workers are the most leak-prone (long-lived streams accumulate buffer state); ws holds per-connection memory; api should stay flat."
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  threshold           = var.alarm_ecs_memory_pct
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = each.key == "api" ? aws_ecs_service.api[0].name : (
      each.key == "sse" ? aws_ecs_service.sse[0].name : aws_ecs_service.ws[0].name
    )
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-${each.key}-memory" }
}

resource "aws_cloudwatch_metric_alarm" "split_service_cpu" {
  for_each = var.enable_alarms && var.three_service_split_enabled ? toset(["api", "sse", "ws"]) : toset([])

  alarm_name          = "${var.project_name}-${each.key}-cpu"
  alarm_description   = "${each.key} ECS service CPUUtilization >${var.alarm_ecs_cpu_pct}% for 10 min. Either traffic outpaced autoscaling or a request handler is in a hot loop."
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 10
  datapoints_to_alarm = 8
  threshold           = var.alarm_ecs_cpu_pct
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = each.key == "api" ? aws_ecs_service.api[0].name : (
      each.key == "sse" ? aws_ecs_service.sse[0].name : aws_ecs_service.ws[0].name
    )
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = { Name = "${var.project_name}-${each.key}-cpu" }
}


# =============================================================================
# VM-AUTO-RECOVERY ALERTING (2026-05-17 post-incident additions)
# =============================================================================
#
# Background
# ----------
# On 2026-05-17 14:41–15:05Z a single EC2 cloud VM at 18.207.92.91:8080 went
# dark for 24 minutes.  The backend retried 7× per call (~38s each) and
# accumulated 91 dial timeouts in CloudWatch.  No alarm fired.  No one was
# paged.  The user's CUA session was broken with no automated recovery.
#
# This block adds the alarm coverage that would have paged within 5 minutes:
#
#   * A1  VM dial-timeout spike      — backend log-pattern metric filter
#   * A2  Public ALB 5xx (ELB+Target)
#   * A3  Internal ALB 5xx (gated on remove_frontend_sidecar)
#   * A4  ECS RunningTaskCount below desired
#   * A5  ElectronRpc drop storm     — log-pattern metric filter
#   * A6  RPC reconnect storm        — log-pattern metric filter
#   * A7  42702 ambiguous_user_id    — log-pattern metric filter (NEW-1 guard)
#
# All alarms route to `aws_sns_topic.alarms` (created above on first use).
#
# The local helper `local.alarm_actions` already evaluates to the SNS topic ARN
# when enable_alarms is on and `[]` otherwise; the new alarms reuse it so the
# enable/disable contract is preserved.
#
# Tagging
# -------
# Every resource in this block carries:
#   Module    = "alerting"
#   Project   = var.project_name
#   ManagedBy = "terraform"
# This makes it trivial to slice CloudWatch billing or `aws cloudwatch
# describe-alarms` output to the post-incident additions.
# =============================================================================


# -----------------------------------------------------------------------------
# Shared tags + locals for the auto-recovery alarm block.  Keeping these here
# avoids polluting locals.tf and keeps the contract local to the file.
# -----------------------------------------------------------------------------

locals {
  alerting_tags = {
    Module    = "alerting"
    Project   = var.project_name
    ManagedBy = "terraform"
  }
}


# =============================================================================
# A1. VM dial-timeout spike  (P1)
# =============================================================================
#
# Pattern: `Timeout connecting to VM agent at ` (vm_control.py line 306) emits
# once per failed dial.  On 2026-05-17 the count hit 91 in a 24 min window
# while ZERO existing alarms covered that signal.
#
# CloudWatch Logs filter pattern uses the bracketed [literal] form so AWS
# performs a substring match against each log line and counts each match
# as 1 datapoint in the metric.
# =============================================================================

resource "aws_cloudwatch_log_metric_filter" "backend_vm_dial_timeouts" {
  count          = var.enable_alarms ? 1 : 0
  name           = "${var.project_name}-vm-dial-timeouts"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  # CloudWatch Logs filter patterns: quoted substring matches the literal
  # text inside the log line.  Backend emits "Timeout connecting to VM agent
  # at {host}:{port}" — we match the stable prefix only so future port/host
  # changes don't break the metric.
  pattern = "\"Timeout connecting to VM agent at\""

  metric_transformation {
    name          = "BackendVmAgentDialTimeouts"
    namespace     = "Coasty/Backend"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "backend_vm_dial_timeouts" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-backend-vm-dial-timeouts"
  alarm_description   = "Backend emitted >5 'Timeout connecting to VM agent' lines in 5 min. The 2026-05-17 incident produced 91 in 24 min with NO alarm fire — this catches it within 5 min. Triggers EC2 agent auto-replace via machine-cleanup."
  namespace           = "Coasty/Backend"
  metric_name         = "BackendVmAgentDialTimeouts"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-backend-vm-dial-timeouts"
    Severity = "P1"
  })

  depends_on = [aws_cloudwatch_log_metric_filter.backend_vm_dial_timeouts]
}


# =============================================================================
# A2. Public ALB 5xx alarm (P0)
# =============================================================================
#
# A simple count-based alarm separate from the burst-style alarms above.  The
# existing `alb_elb_5xx_burst` (>50 in 1 min) is calibrated to catch volume
# spikes during 1,000-RPS DDOS-style events; this one catches lower-volume
# sustained badness like the 2026-05-17 dial-timeout cascade.
# =============================================================================

resource "aws_cloudwatch_metric_alarm" "alb_elb_5xx_count" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-alb-elb5xx-count"
  alarm_description   = "Public ALB returned >10 ELB-side 5xx in 5 min.  Catches lower-volume sustained failure modes that the 50-in-1min burst alarm misses."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-alb-elb5xx-count"
    Severity = "P0"
  })
}

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx_count" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-alb-target5xx-count"
  alarm_description   = "Public ALB target returned >10 5xx in 5 min.  Lower threshold than alb_target_5xx_sustained (50/5min) — catches the 2026-05-17 24-min slow-bleed pattern."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-alb-target5xx-count"
    Severity = "P0"
  })
}


# =============================================================================
# A3. Internal ALB 5xx (P1)
# =============================================================================
#
# Internal ALB only exists when var.remove_frontend_sidecar is true.  When the
# flag is off the count-guards below evaluate to zero and the alarm doesn't
# fire — no orphan resources.
# =============================================================================

resource "aws_cloudwatch_metric_alarm" "alb_internal_elb_5xx_count" {
  count               = var.enable_alarms && var.remove_frontend_sidecar ? 1 : 0
  alarm_name          = "${var.project_name}-alb-int-elb5xx-count"
  alarm_description   = "Internal ALB returned >10 ELB-side 5xx in 5 min.  Frontend→backend (via internal ALB) is failing — chat/CRUD paths broken."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.internal_backend[0].arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-alb-int-elb5xx-count"
    Severity = "P1"
  })
}

resource "aws_cloudwatch_metric_alarm" "alb_internal_target_5xx_count" {
  count               = var.enable_alarms && var.remove_frontend_sidecar ? 1 : 0
  alarm_name          = "${var.project_name}-alb-int-target5xx-count"
  alarm_description   = "Internal ALB target returned >10 5xx in 5 min.  Backend handlers on the api/sse path are throwing."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.internal_backend[0].arn_suffix
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-alb-int-target5xx-count"
    Severity = "P1"
  })
}


# =============================================================================
# A4. ECS RunningTaskCount below desired (P1)
# =============================================================================
#
# `AWS/ECS::RunningTaskCount` is published per service.  When it falls below
# the service's `desired_count` (often because of an OOM kill or a deploy that
# couldn't place tasks), no other alarm above catches it specifically — they
# catch downstream symptoms (5xx, latency).  This is the upstream signal.
#
# We alarm at < desired_count for 5 min so the alarm doesn't flap during a
# normal deploy (which briefly shows 1 of 2 tasks running while the second
# rolls).  The 5-minute window covers a typical deploy window with margin.
#
# Frontend `app` service is always present; split services are gated on the
# three_service_split flag.
# =============================================================================

# -----------------------------------------------------------------------------
# 2026-05-27 namespace correction (the "10-day zombie alarm" fix)
#
# These four alarms (`-ecs-app-task-count` and the three split-service
# `-ecs-{api,sse,ws}-task-count`) sat stuck in ALARM from 2026-05-17 through
# 2026-05-27 — 10 calendar days of false-positive paging — because the
# metric was being read from the wrong namespace.
#
# `RunningTaskCount` is published ONLY in the `ECS/ContainerInsights`
# namespace, NOT in `AWS/ECS`. The basic `AWS/ECS` namespace only carries
# CPUUtilization, MemoryUtilization, CPUReservation, MemoryReservation.
# With `treat_missing_data = "breaching"`, the missing-namespace metric
# caused continuous ALARM state and no real datapoints.
#
# Container Insights is enabled on the cluster (see ecs.tf cluster setting
# `containerInsights = enabled`), so the metric IS publishing — just not
# under the namespace these alarms were querying.
#
# The fix is the namespace change. Threshold and missing-data behaviour
# are deliberately retained: a real "below desired count for 5 min" event
# is genuinely critical (OOM kill, failed deploy, capacity exhaustion).
# -----------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "ecs_app_task_count" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-ecs-app-task-count"
  alarm_description   = "Frontend ECS service running task count fell below floor (${var.min_capacity}) for 5 min. Real signals only: OOM kill, failed deploy, or capacity exhaustion. The 2026-05-17 to 2026-05-27 zombie-ALARM period was a namespace bug (AWS/ECS instead of ECS/ContainerInsights), now fixed."
  namespace           = "ECS/ContainerInsights"
  metric_name         = "RunningTaskCount"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  # Threshold < min_capacity catches "we lost a task we MUST have"; using
  # min_capacity (the autoscale floor) means a partial-deploy state isn't
  # an alarm until it sticks for 5 minutes.
  threshold           = var.min_capacity
  comparison_operator = "LessThanThreshold"
  # treat_missing_data = "breaching" is intentional: if the metric stops
  # publishing entirely (Container Insights agent crash, IAM revocation,
  # account suspension) we WANT to be paged. The bug that caused 10 days
  # of false alarms was the wrong namespace, not this setting.
  treat_missing_data = "breaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-ecs-app-task-count"
    Severity = "P1"
  })
}

resource "aws_cloudwatch_metric_alarm" "ecs_split_task_count" {
  for_each = var.enable_alarms && var.three_service_split_enabled ? toset(["api", "sse", "ws"]) : toset([])

  alarm_name          = "${var.project_name}-ecs-${each.key}-task-count"
  alarm_description   = "${each.key} ECS service running task count fell below floor for 5 min. ws task crash kills Electron desktop connectivity; sse task crash kills chat streaming; api task crash kills CRUD. See ecs_app_task_count for the 2026-05-27 namespace-bug rationale."
  namespace           = "ECS/ContainerInsights"
  metric_name         = "RunningTaskCount"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  threshold = (
    each.key == "api" ? var.split_api_min_capacity : (
      each.key == "sse" ? var.split_sse_min_capacity : var.split_ws_min_capacity
    )
  )
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = each.key == "api" ? aws_ecs_service.api[0].name : (
      each.key == "sse" ? aws_ecs_service.sse[0].name : aws_ecs_service.ws[0].name
    )
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-ecs-${each.key}-task-count"
    Severity = "P1"
  })
}


# =============================================================================
# A5. ElectronRpc drop storm (P0)
# =============================================================================
#
# Pattern: `ElectronRpc: dropping remote command for {machine_id}` — emitted
# by electron_rpc.py:983 when the inflight ceiling is reached.  On 2026-04-26
# two machines hit 138 drops in 30 min while the WS sat connected; the user's
# clicks/keystrokes were silently dropped.  This alarm catches >100/5min so
# we page before that scale.
# =============================================================================

resource "aws_cloudwatch_log_metric_filter" "backend_electron_rpc_drops" {
  count          = var.enable_alarms ? 1 : 0
  name           = "${var.project_name}-electron-rpc-drops"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  # Substring match on the stable prefix.  The full log line includes the
  # machine_id and a reason, but anchoring on the prefix is enough to count.
  pattern = "\"ElectronRpc: dropping remote command\""

  metric_transformation {
    name          = "ElectronRpcDroppedCommands"
    namespace     = "Coasty/Backend"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "backend_electron_rpc_drops" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-electron-rpc-drops"
  alarm_description   = "Backend dropped >100 Electron remote commands in 5 min.  Per-machine inflight cap hit — user clicks/keystrokes silently dropped.  Check electron_rpc.py:983 and the affected machine_ids in the matching log lines."
  namespace           = "Coasty/Backend"
  metric_name         = "ElectronRpcDroppedCommands"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 100
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-electron-rpc-drops"
    Severity = "P0"
  })

  depends_on = [aws_cloudwatch_log_metric_filter.backend_electron_rpc_drops]
}


# =============================================================================
# A6. RPC reconnect storm (P1)
# =============================================================================
#
# Pattern: `{name} consumer error:` lines emitted by ReconnectBackoff in
# rpc_backoff.py.  The dominant `{name}` values are:
#   ElectronRpc.resp / ElectronRpc.cancel / ElectronRpc.resume
#   SwarmRpc.cmd / SwarmRpc.resp
#   CuaSessionRpc.cmd / CuaSessionRpc.resp
# Anchoring on the common suffix "consumer error" matches all of them in one
# metric filter.  This pages when redis/the broker has been flapping long
# enough to clear the dedup'd ERROR rate (>= 50 emitted lines in 10 min).
#
# Why 10 min and 50: ReconnectBackoff emits at most one ERROR per 60s after
# the initial 5-WARN burst.  50 in 10 min means >= 5 consumers ALL escalating,
# i.e. a multi-replica or multi-consumer outage — not a one-off flake.
# =============================================================================

resource "aws_cloudwatch_log_metric_filter" "backend_rpc_listener_errors" {
  count          = var.enable_alarms ? 1 : 0
  name           = "${var.project_name}-rpc-listener-errors"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  # rpc_backoff.py logs as: "{Name}.{role} consumer error: {exc} — restarting in {delay}s ..."
  # The literal "consumer error" suffix is the most stable anchor.
  pattern = "\"consumer error\""

  metric_transformation {
    name          = "RpcConsumerErrors"
    namespace     = "Coasty/Backend"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "backend_rpc_listener_errors" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-rpc-listener-errors"
  alarm_description   = "Backend RPC consumer loops (electron/swarm/cua_session) emitted >50 'consumer error' lines in 10 min.  Likely broker/Redis outage or auth-loop.  Check rpc_backoff dedup windows; if escalated, traffic between replicas is silently dropping."
  namespace           = "Coasty/Backend"
  metric_name         = "RpcConsumerErrors"
  statistic           = "Sum"
  period              = 600
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 50
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-rpc-listener-errors"
    Severity = "P1"
  })

  depends_on = [aws_cloudwatch_log_metric_filter.backend_rpc_listener_errors]
}


# =============================================================================
# A7. 42702 ambiguous_user_id regression (P0)
# =============================================================================
#
# Pattern: `update_subscription_status RPC failed` — the exact log line
# emitted by app/api/credits/webhook/route.ts:673 when the Stripe webhook can't
# update the subscription row.  The NEW-1 audit fixed a 42702 ambiguous_user_id
# defect in the matching Supabase function; this alarm fires the SECOND it ever
# reappears so we know the migration regressed.
#
# Threshold = 1: this should NEVER happen post-fix.  If it fires, treat it as
# a code regression, not an ops issue.
# =============================================================================

resource "aws_cloudwatch_log_metric_filter" "billing_subscription_rpc_failed" {
  count          = var.enable_alarms ? 1 : 0
  name           = "${var.project_name}-billing-subscription-rpc-failed"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "\"update_subscription_status RPC failed\""

  metric_transformation {
    name          = "BillingSubscriptionRpcFailures"
    namespace     = "Coasty/Backend"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "billing_subscription_rpc_failed" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-billing-subscription-rpc-failed"
  alarm_description   = "update_subscription_status RPC has failed at least once. This is the NEW-1 42702 regression signature - billing webhooks aren't persisting subscription state. Treat as code regression; do NOT page-and-go, investigate the migration. Recovery: query public.webhook_dead_letters for unresolved rows, replay via scripts/reconcile_subscription.py. Re-apply migration 015 or 021 if schema.sql regressed. See infra/aws/ALARMS_BILLING_HARDENING.md."
  namespace           = "Coasty/Backend"
  metric_name         = "BillingSubscriptionRpcFailures"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-billing-subscription-rpc-failed"
    Severity = "P0"
  })

  depends_on = [aws_cloudwatch_log_metric_filter.billing_subscription_rpc_failed]
}


# =============================================================================
# A8. OSWorld retained-session count (2026-05-23 addition, P1)
# =============================================================================
#
# The OSWorld cleanup agent publishes a custom CloudWatch metric after each
# cleanup pass:
#
#   Namespace   : Coasty/OSWorld
#   MetricName  : SessionCount
#   Dimension   : ServiceName=${var.project_name}-api
#   Unit        : Count
#   Period      : 60s
#
# Memory budget derivation:
#   * llmhub-api task memory cap          : 1024 MB
#   * per-OSWorld-session footprint       : ~11.5 MB
#   * non-OSWorld baseline                : ~500 MB
#   * 30 sessions -> 30 * 11.5 + 500       = 845 MB  (~ 82% of 1024 MB)
#
# Existing alarm split_service_memory["api"] fires at 80% MemoryUtilization
# sustained 5 min. OSWorld saturation is the dominant driver of api memory
# growth, so we want a UPSTREAM signal that fires BEFORE the memory alarm
# does -- giving cleanup logic / ops a window to act before the OOM kill or
# autoscale thrash.
#
# Threshold = 30 sessions sustained 3 of 5 minutes (so a brief settle
# between cleanup passes doesn't page). Statistic = Maximum so we catch the
# peak per-minute count, not an averaged-down value.
#
# Cross-agent contract: assumes OSWorld cleanup agent has not landed yet, so
# the metric will simply be MISSING until the cleanup agent ships. With
# treat_missing_data = notBreaching the alarm stays in OK until the metric
# starts publishing. If the cleanup agent ships with a DIFFERENT namespace /
# metric name / dimension key, update this alarm to match.
# =============================================================================

resource "aws_cloudwatch_metric_alarm" "osworld_session_count" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-osworld-session-count"
  alarm_description   = "OSWorld retained-session count >= 30 sustained 3 of 5 minutes. Each session ~11.5MB; 30 sessions ~ 460MB OSWorld + ~500MB baseline ~ 845MB on ${var.project_name}-api 1024MB cap (~82%). Fires BEFORE split_service_memory[api] at 80% so ops can intervene before OOM."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  threshold           = 30
  treat_missing_data  = "notBreaching"

  namespace   = "Coasty/OSWorld"
  metric_name = "SessionCount"
  period      = 60
  statistic   = "Maximum"

  dimensions = {
    ServiceName = "${var.project_name}-api"
  }

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-osworld-session-count"
    Severity = "P1"
  })
}


# =============================================================================
# B1. Postgres 42702 SQLSTATE anywhere (P0) — 2026-05-26 NEW-1 hardening
# =============================================================================
#
# The NEW-1 42702 (ambiguous_column_reference) defect first surfaced inside
# update_subscription_status, but the same shape can occur in ANY PL/pgSQL
# function with RETURNS TABLE that shadows a real column. The A7 alarm above
# pins on the specific log line emitted by the billing webhook handler; this
# alarm fires on the literal SQLSTATE anywhere in /ecs/llmhub so we catch the
# next occurrence even if it's in a different RPC (e.g. credits, sessions).
# =============================================================================

resource "aws_cloudwatch_log_metric_filter" "postgres_42702_errors" {
  count = var.enable_alarms ? 1 : 0

  name           = "${var.project_name}-postgres-42702-errors"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "\"42702\"" # Matches the literal SQLSTATE in any log line

  metric_transformation {
    name          = "Postgres42702Errors"
    namespace     = "Coasty/Database"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "postgres_42702_errors" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-postgres-42702-errors"
  alarm_description   = "Postgres SQLSTATE 42702 (ambiguous column reference) detected ANYWHERE in /ecs/llmhub. This is the NEW-1 regression signature, can occur in any PL/pgSQL function with RETURNS TABLE that shadows real table columns. Investigate the function and re-apply migration 015/021. See infra/aws/ALARMS_BILLING_HARDENING.md."
  namespace           = "Coasty/Database"
  metric_name         = "Postgres42702Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-postgres-42702-errors"
    Severity = "P0"
  })

  depends_on = [aws_cloudwatch_log_metric_filter.postgres_42702_errors]
}


# =============================================================================
# B2. Webhook RPC failed (structured log) (P0)
# =============================================================================
#
# Agent B is adding a structured log line of the shape:
#   [webhook-rpc-failed] event=X type=Y rpc=Z code=W dead_letter_written=true
# emitted for EVERY RPC failure inside the Stripe webhook handler (not just
# update_subscription_status). The A7 alarm above is RPC-specific; this one
# catches the broader signal so we know a dead-letter row was just written.
# =============================================================================

resource "aws_cloudwatch_log_metric_filter" "webhook_rpc_failed" {
  count = var.enable_alarms ? 1 : 0

  name           = "${var.project_name}-webhook-rpc-failed"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "\"[webhook-rpc-failed]\""

  metric_transformation {
    name          = "WebhookRpcFailed"
    namespace     = "Coasty/Billing"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "webhook_rpc_failed" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-webhook-rpc-failed"
  alarm_description   = "Stripe webhook handler caught a downstream RPC failure and dead-lettered the event. Recovery: query public.webhook_dead_letters for unresolved rows, replay via scripts/reconcile_subscription.py. See incident 2026-05-26 22:57 UTC NEW-1."
  namespace           = "Coasty/Billing"
  metric_name         = "WebhookRpcFailed"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-webhook-rpc-failed"
    Severity = "P0"
  })

  depends_on = [aws_cloudwatch_log_metric_filter.webhook_rpc_failed]
}


# =============================================================================
# B3. Webhook 5xx responses (P1)
# =============================================================================
#
# Agent B is converting the silent-200-on-RPC-error response to a proper 5xx
# so Stripe retries. We track the rate of 5xx returns from /api/credits/webhook
# to spot cascading failures (missing migration, broken RPC). Threshold is >5
# in 5 min because Stripe will retry each event a few times naturally, but a
# burst means the underlying RPC is structurally broken, not transient.
# =============================================================================

resource "aws_cloudwatch_log_metric_filter" "webhook_5xx_responses" {
  count = var.enable_alarms ? 1 : 0

  name           = "${var.project_name}-webhook-5xx-responses"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "{ $.path = \"/api/credits/webhook\" && $.status >= 500 }"

  metric_transformation {
    name          = "Webhook5xxResponses"
    namespace     = "Coasty/Billing"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "webhook_5xx_responses_burst" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-webhook-5xx-burst"
  alarm_description   = "More than 5 Stripe webhook 5xx responses in 5 min. Stripe will retry for ~3 days but downstream RPC is broken. Investigate via webhook_dead_letters."
  namespace           = "Coasty/Billing"
  metric_name         = "Webhook5xxResponses"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions

  tags = merge(local.alerting_tags, {
    Name     = "${var.project_name}-webhook-5xx-burst"
    Severity = "P1"
  })

  depends_on = [aws_cloudwatch_log_metric_filter.webhook_5xx_responses]
}


# =============================================================================
# B4. Webhook dead-letter writes (metric only, no alarm)
# =============================================================================
#
# Kept for dashboard visibility and post-incident analysis. The B2 alarm above
# (webhook_rpc_failed) already pages on each occurrence; tracking the
# dead_letter_written=true sub-signal separately lets us confirm the
# dead-letter table is actually being populated when the upstream alarm fires.
# =============================================================================

resource "aws_cloudwatch_log_metric_filter" "webhook_dead_letter_writes" {
  count = var.enable_alarms ? 1 : 0

  name           = "${var.project_name}-webhook-dead-letter-writes"
  log_group_name = aws_cloudwatch_log_group.ecs.name
  pattern        = "\"dead_letter_written=true\""

  metric_transformation {
    name          = "WebhookDeadLetterWrites"
    namespace     = "Coasty/Billing"
    value         = "1"
    default_value = "0"
  }
}


# -----------------------------------------------------------------------------
# Output: SNS topic ARN so people can hook up PagerDuty / Slack / etc.
# -----------------------------------------------------------------------------

output "alarms_sns_topic_arn" {
  description = "SNS topic that fans out CloudWatch alarms.  Subscribe PagerDuty / Slack / oncall email here.  null when var.enable_alarms = false."
  value       = var.enable_alarms ? aws_sns_topic.alarms[0].arn : null
}
