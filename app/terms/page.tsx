"use client"

import { LegalPage, type LegalSection } from "@/app/components/legal/legal-page"
import { TERMS_EFFECTIVE_DATE, TERMS_VERSION } from "@/lib/legal/versions"
import { priceTermsForm } from "@/lib/pricing/format"

const sections: LegalSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of terms",
    blocks: [
      {
        kind: "p",
        text: "These Terms of Service are a legally binding agreement between you and Coasty. By creating an account, signing in, or using Coasty in any way, you agree to these Terms and to our Privacy Policy. If you do not agree, do not use the service.",
      },
    ],
  },
  {
    id: "service",
    title: "The service",
    blocks: [
      {
        kind: "sub",
        title: "What we provide",
        items: [
          "AI agents that operate computers, browsers, terminals, and desktop environments on your behalf.",
          "Multi-model AI chat and a collaborative AI workspace.",
          "Code execution, automation tools, and web research.",
        ],
      },
      {
        kind: "sub",
        title: "Availability",
        items: [
          "The service is provided on an as-available basis.",
          "We aim for high uptime but do not guarantee uninterrupted service.",
          "We may add, change, or remove features at our discretion.",
        ],
      },
    ],
  },
  {
    id: "content-license",
    title: "Your content and the license you grant",
    blocks: [
      {
        kind: "p",
        text: "You keep ownership of the content you create with Coasty. To run the service, you grant us a broad license over that content and the data you make available to the agent.",
      },
      {
        kind: "callout",
        text: "You grant Coasty a worldwide, non-exclusive, royalty-free license to host, store, reproduce, transmit, process, analyze, and use your content and session data in order to operate, secure, support, and improve the service, to run the agents you request, and to do so through our AI and infrastructure providers. This license lasts as long as we host your content and ends when it is deleted, except for backups that age out and records we must retain by law.",
      },
      {
        kind: "p",
        text: "We do not sell your personal information, and we do not use your private content to train third-party foundation models. We may use aggregated or de-identified data to improve the service. You are responsible for having the rights to all content and credentials you provide to the agent.",
      },
    ],
  },
  {
    id: "agents",
    title: "AI agents and automation",
    blocks: [
      {
        kind: "p",
        text: "Coasty acts on your instructions. When you run an agent, you authorize it to access and act on the screens, files, terminals, browsers, accounts, and data you make available to it, and to take actions on your behalf, including actions that create, modify, or delete data.",
      },
      {
        kind: "list",
        items: [
          "You are responsible for the instructions you give and for the actions agents take under your account.",
          "You are responsible for supervising agent activity and for keeping sensitive material out of a session when you do not want it accessed.",
          "We log agent actions for security, debugging, and audit purposes.",
          "Automated actions must comply with these Terms and all applicable laws.",
        ],
      },
      {
        kind: "callout",
        text: "AI is probabilistic and can be wrong. Agent output and automated actions may be inaccurate, incomplete, or unintended. Review results before relying on them, and do not use Coasty for actions whose consequences you are not prepared to accept.",
      },
    ],
  },
  {
    id: "responsibilities",
    title: "Your responsibilities",
    blocks: [
      {
        kind: "sub",
        title: "Account security",
        items: [
          "Keep your account credentials confidential and your information accurate.",
          "Tell us promptly about any unauthorized access.",
          "You are responsible for all activity under your account.",
        ],
      },
      {
        kind: "sub",
        title: "Acceptable use",
        items: [
          "Use Coasty in compliance with all applicable laws.",
          "Do not bypass security measures, usage limits, or authentication.",
          "Do not interfere with or disrupt the service.",
          "Respect the intellectual property and privacy rights of others.",
        ],
      },
    ],
  },
  {
    id: "prohibited",
    title: "Prohibited uses",
    blocks: [
      {
        kind: "list",
        items: [
          "Attacking, probing, or disrupting other systems or networks.",
          "Distributing malware or harmful code.",
          "Collecting other people's personal data without a lawful basis or consent.",
          "Crypto mining or other heavy workloads unrelated to legitimate use.",
          "Spam or unsolicited communications.",
          "Reselling or redistributing the service without authorization.",
          "Any illegal activity or activity that violates these Terms.",
        ],
      },
    ],
  },
  {
    id: "billing",
    title: "Plans, billing, and renewal",
    blocks: [
      {
        kind: "sub",
        title: "Subscriptions and renewal",
        items: [
          "Paid plans are billed in advance on a recurring basis and renew automatically until cancelled.",
          "You can cancel anytime, effective at the end of the current billing period.",
          "Prices may change with notice. Except where required by law, payments are non-refundable for partial periods or unused resources.",
        ],
      },
      {
        kind: "sub",
        title: priceTermsForm("starter"),
        items: [
          "A monthly allowance of AI agent usage credits.",
          "A fair-use policy applies, and the allowance resets each billing cycle.",
        ],
      },
      {
        kind: "sub",
        title: priceTermsForm("unlimited"),
        items: [
          "Unlimited AI agent usage subject to a fair-use policy and priority resources.",
          "Automated high-frequency or abusive usage may be reviewed, and we may throttle or suspend accounts after notice.",
        ],
      },
    ],
  },
  {
    id: "ip",
    title: "Intellectual property",
    blocks: [
      {
        kind: "p",
        text: "Coasty and its original content, features, and functionality are owned by us and protected by intellectual property laws. You retain rights to the content you create, subject to the license above. Content generated by AI models belongs to you, subject to the terms of the underlying model providers, and we make no ownership claim to it.",
      },
    ],
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    blocks: [
      {
        kind: "callout",
        text: "THE SERVICE IS PROVIDED ON AN AS-IS AND AS-AVAILABLE BASIS, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTY THAT AI OUTPUT OR AUTOMATED ACTIONS WILL BE ACCURATE, COMPLETE, OR FREE OF ERROR. YOU USE COASTY, AND ALLOW IT TO ACT ON YOUR DEVICES AND DATA, AT YOUR OWN RISK.",
      },
    ],
  },
  {
    id: "liability",
    title: "Limitation of liability",
    blocks: [
      {
        kind: "callout",
        text: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, COASTY WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL. OUR TOTAL LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE MONTHS BEFORE THE CLAIM.",
      },
    ],
  },
  {
    id: "indemnification",
    title: "Indemnification",
    blocks: [
      {
        kind: "p",
        text: "You agree to indemnify and hold harmless Coasty and its affiliates, officers, employees, and agents from any claims, damages, losses, liabilities, and expenses arising from your use of the service, the actions you direct agents to take, or your violation of these Terms or applicable law.",
      },
    ],
  },
  {
    id: "termination",
    title: "Termination",
    blocks: [
      {
        kind: "p",
        text: "You may close your account at any time from your settings. We may suspend or terminate your access if you violate these Terms, if your use harms the service or other users, or where required by law. On termination your right to use the service ends, and we may delete your data after a reasonable period except where we must retain it.",
      },
    ],
  },
  {
    id: "governing-law",
    title: "Governing law and disputes",
    blocks: [
      {
        kind: "p",
        text: "These Terms are governed by the laws of the State of Delaware, United States, without regard to its conflict-of-law rules. You agree to the exclusive jurisdiction of the state and federal courts located in Delaware for any dispute that is not otherwise resolved, except where applicable law gives you the right to bring a claim in your local courts.",
      },
    ],
  },
  {
    id: "changes",
    title: "Changes and contact",
    blocks: [
      {
        kind: "p",
        text: "We may update these Terms from time to time. When changes are material we will update the version and date above and, where appropriate, notify you. Continued use of Coasty after an update means you accept the revised Terms. Questions can be sent to legal@coasty.ai.",
      },
    ],
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      kicker="Legal"
      title="Terms of Service"
      subtitle="The agreement that governs your use of Coasty, your AI employee that works across your computer."
      updatedLabel="Effective"
      updatedDate={TERMS_EFFECTIVE_DATE}
      version={TERMS_VERSION}
      sections={sections}
      closing={{
        title: "By using Coasty, you agree to these Terms.",
        text: "These Terms form a binding agreement between you and Coasty. If you do not agree to them, you must not use the service.",
      }}
      ctaLabel="I agree, get started"
    />
  )
}
