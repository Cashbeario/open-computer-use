"use client"

import { LegalPage, type LegalSection } from "@/app/components/legal/legal-page"
import { PRIVACY_LAST_UPDATED, PRIVACY_VERSION } from "@/lib/legal/versions"

const sections: LegalSection[] = [
  {
    id: "overview",
    title: "Overview",
    blocks: [
      {
        kind: "p",
        text: "Coasty is an AI employee that operates a computer on your behalf. To do that work it necessarily sees and acts on a lot of your information, so we keep this policy plain about what we collect, what the agent can access, how we use it, and the controls you have. This policy applies to the hosted Coasty service at coasty.ai and the Coasty desktop app.",
      },
      {
        kind: "callout",
        text: "Short version: we collect what we need to run the service and the agents you ask for, we use it broadly to operate, secure, bill for, and improve Coasty, we share it only with the infrastructure and AI providers that power the product, and we do not sell your personal information.",
      },
    ],
  },
  {
    id: "agent-access",
    title: "What the agent can access",
    blocks: [
      {
        kind: "p",
        text: "Coasty is a computer-use product. When you run an agent, you are authorizing it to see and act on whatever is needed to complete the task you gave it. Depending on how you use Coasty, that can include a wide range of your information.",
      },
      {
        kind: "list",
        items: [
          "Screenshots of the screen the agent is operating, captured during a session so the model can see what it is doing.",
          "Files and folders you point the agent at, including their contents, which it may read, create, edit, or delete.",
          "Terminal and command output produced while the agent works.",
          "Web pages and browser activity the agent navigates on your instruction.",
          "Credentials and connected accounts you choose to provide so the agent can act as you on a site or service.",
        ],
      },
      {
        kind: "callout",
        text: "This is broad by design. You decide what to expose to a session, and you can keep sensitive material out of the agent's reach. On the desktop app the agent runs on your own machine and you control what it is pointed at.",
      },
    ],
  },
  {
    id: "data-collection",
    title: "Information we collect",
    blocks: [
      {
        kind: "sub",
        title: "Account information",
        items: [
          "Email address, and your name and profile picture if you provide them.",
          "Onboarding details you choose to share (role, company, team size, use case).",
        ],
      },
      {
        kind: "sub",
        title: "Content and activity",
        items: [
          "Your prompts and chats, and the assistant's replies.",
          "Agent task history, tool calls, and their results.",
          "Files you upload and screenshots captured during agent sessions.",
          "Model preferences and settings.",
        ],
      },
      {
        kind: "sub",
        title: "Payment information",
        text: "Subscription, billing, and transaction records. Card details are handled by Stripe, our payment processor, and are not stored on our servers.",
      },
      {
        kind: "sub",
        title: "Technical information",
        items: [
          "IP address, device and browser information, and the desktop app's system identifiers.",
          "Usage patterns, performance data, and, where you have consented, cookies and analytics identifiers.",
        ],
      },
    ],
  },
  {
    id: "data-use",
    title: "How we use your information",
    blocks: [
      {
        kind: "p",
        text: "We use the information above broadly to run Coasty and make it better. Specifically, we use it to:",
      },
      {
        kind: "list",
        items: [
          "Provide and operate the service, and run the AI agents and virtual machines you request.",
          "Process your content through the AI and infrastructure providers that power the product.",
          "Store your chats, task history, and session data so you can return to them.",
          "Secure the service, detect and prevent abuse, fraud, and misuse, and enforce our Terms.",
          "Measure usage and analyze, debug, and improve the service, our agents, and the product experience.",
          "Bill you, manage subscriptions and credits, and provide support.",
          "Comply with legal obligations and respond to lawful requests.",
        ],
      },
      {
        kind: "callout",
        text: "We do not sell your personal information, and we do not use your private content to train third-party foundation models. We may use aggregated or de-identified data, which cannot reasonably be linked back to you, to analyze and improve Coasty.",
      },
      {
        kind: "p",
        text: "Where the law requires a legal basis (for example in the EEA and UK), we rely on performing our contract with you to provide the service, our legitimate interests in securing and improving it, your consent for optional analytics and cookies, and compliance with legal obligations.",
      },
    ],
  },
  {
    id: "providers",
    title: "AI models and infrastructure providers",
    blocks: [
      {
        kind: "p",
        text: "To deliver the service we share the data needed to run it with a small set of providers who process it on our behalf. We share only what is necessary for each provider's role.",
      },
      {
        kind: "list",
        items: [
          "Amazon Web Services (AWS): all AI model inference runs through Amazon Bedrock, plus the compute that powers the agent virtual machines, in the United States.",
          "Supabase: authentication and database storage for your account, chats, and history.",
          "Stripe: payment processing and subscription billing.",
          "PostHog and Umami: product analytics, loaded only where you have consented.",
          "Google: sign-in and web search used by the agent.",
        ],
      },
      {
        kind: "sub",
        title: "Model providers available through Amazon Bedrock",
        text: "Depending on the model you select for a task, your prompts and content are processed by a model from one of the providers below. Every model is hosted and run inside Amazon Bedrock, so your content is processed within AWS and is not sent separately to the companies that created the models.",
        items: [
          "Anthropic (proprietary models).",
          "Amazon (proprietary models).",
          "Mistral (proprietary models).",
          "Meta (open-weight models).",
        ],
      },
      {
        kind: "callout",
        text: "Your prompts, screenshots, and related content are sent to Amazon Bedrock so the model you choose can reason about your task. We do not run model inference on Microsoft Azure, and we do not send your content directly to OpenAI, Google Gemini, or other external model APIs.",
      },
    ],
  },
  {
    id: "security",
    title: "Storage and security",
    blocks: [
      {
        kind: "sub",
        title: "Encryption",
        text: "Data is encrypted in transit with TLS. Sensitive secrets such as your stored API keys are encrypted at rest with AES-256-GCM using a per-secret initialization vector, and are never stored in plain text. You can opt additional categories of your data into at-rest encryption from your account settings.",
      },
      {
        kind: "sub",
        title: "Infrastructure",
        items: [
          "Agent virtual machines run in isolated environments with resource limits and automatic session termination.",
          "No data persists on a virtual machine's filesystem between sessions; your chats and history are stored separately in our database.",
          "Database access is protected by Row Level Security so each account can only reach its own data.",
        ],
      },
      {
        kind: "p",
        text: "No method of transmission or storage is perfectly secure, but we work to protect your information with industry-standard controls and to limit access to it within our team.",
      },
    ],
  },
  {
    id: "retention",
    title: "Data retention",
    blocks: [
      {
        kind: "p",
        text: "We keep your data for as long as your account is active so the service works as expected. You can delete individual chats at any time, and you can delete your entire account and its associated data from Account, then Data. We retain limited records longer where we need them for billing, security, dispute resolution, or to meet legal obligations, and backups age out on a rolling basis.",
      },
    ],
  },
  {
    id: "rights",
    title: "Your rights and choices",
    blocks: [
      {
        kind: "p",
        text: "You have meaningful control over your information, and we have built the tools to exercise it directly in the product:",
      },
      {
        kind: "list",
        items: [
          "Access and export a copy of your data from Account, then Data.",
          "Delete your account and associated data from Account, then Data.",
          "Correct or update your profile information at any time.",
          "Turn product analytics on or off, and withdraw consent, from your privacy settings.",
          "Choose what each agent session is allowed to access.",
        ],
      },
      {
        kind: "p",
        text: "Depending on where you live, you may also have rights to object to or restrict certain processing, to data portability, and to lodge a complaint with your local data protection authority. To make a request or ask a question, contact us at privacy@coasty.ai.",
      },
    ],
  },
  {
    id: "transfers",
    title: "International data transfers",
    blocks: [
      {
        kind: "p",
        text: "Coasty is operated from the United States, and the providers above process data in the United States. If you use Coasty from the EEA, the UK, or elsewhere, your information will be transferred to and processed in the United States. Where required, we rely on appropriate safeguards such as Standard Contractual Clauses or equivalent mechanisms for these transfers.",
      },
    ],
  },
  {
    id: "children",
    title: "Children's privacy",
    blocks: [
      {
        kind: "p",
        text: "Coasty is not intended for children. You must be at least 16 in the EEA, or at least 13 elsewhere, to use the service. We do not knowingly collect personal information from children under these ages. If you believe a child has provided us information, contact us and we will delete it.",
      },
    ],
  },
  {
    id: "changes",
    title: "Changes and contact",
    blocks: [
      {
        kind: "p",
        text: "We may update this policy from time to time. When we make material changes we will update the version and date at the top of this page and, where appropriate, notify you in the product or by email. Continued use of Coasty after an update means you accept the revised policy.",
      },
      {
        kind: "p",
        text: "Questions about this policy or your data can be sent to privacy@coasty.ai.",
      },
    ],
  },
]

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      kicker="Privacy"
      title="Privacy Policy"
      subtitle="How Coasty collects, uses, and protects your information while it works as your AI employee."
      updatedLabel="Last updated"
      updatedDate={PRIVACY_LAST_UPDATED}
      version={PRIVACY_VERSION}
      sections={sections}
      ctaLabel="Get started"
    />
  )
}
