# P0 subscription-provider eligibility review

Fetched **2026-10-22**. Official public documentation/terms only; account-specific
eligibility and legal approval are not established. Scope: Loom's isolated Pi
coding-agent SDK `1.4.0` execution loop with a host-side credential/egress broker,
not either vendor's agent application. No installed Pi provider source inspected
in this research segment; the parent review supplies that separately.

## Finding and recommendation

| Candidate | Evidence-based result for Loom |
| --- | --- |
| ChatGPT/Codex subscription | **Conditional supported route exists:** Sign in with ChatGPT (SIWC) documents direct ChatGPT-plan inference for open-source/locally hosted apps, including custom tools, without requiring the Codex execution loop. Use Loom's own registration and public Responses route, not an official client's tokens/identity or private backend. Loom's eligibility, integration and data-policy fit remain unverified. [O2–O6] |
| Antigravity consumer subscription (Google AI Pro/Ultra) | **Blocked for this custom harness:** additional terms explicitly prohibit third-party software accessing the service. Official headless scripting does not authorize wrapping the CLI as Loom's model backend. A host broker or OAuth adapter does not remove this restriction. [G1–G3] |

Recommendation, not adoption: investigate the SIWC direct route against the pinned
Pi seam while keeping one execution loop. Do not enable live use until owner,
account/workspace, terms, data and adapter gates pass. Google identifies separately
authorized Gemini API/enterprise access for third-party agents; that is a different
billing/permission decision, **not** Antigravity subscription access or an approved
fallback. No G0 closure, provider adoption, external policy approval or live
qualification follows from this report.

## OpenAI: official apps versus custom-harness permission

- Codex authentication distinguishes **ChatGPT sign-in for subscription access**
  from **API keys for usage-based Platform billing**. Its desktop/CLI/IDE/cloud
  documentation describes official Codex surfaces; that alone does not authorize
  a Pi harness to reuse their client identity or credential cache. For CI/CD the
  auth guide says “Use API key authentication for programmatic Codex CLI workflows”.
  It separately documents managed-workspace access tokens for trusted Codex
  automation, not general-purpose API calls. [O1]
- SIWC is the relevant affirmative custom-app route. The overview says:
  “These docs explain ChatGPT plan usage for open-source and locally hosted apps.”
  Paid/remotely hosted apps are directed to an interest form. The general client-ID
  request page says SIWC is offered to “a select group of commercial partners”,
  while the OSS registration guide explicitly says its direct dynamic flow needs
  “neither a client secret nor a partner API key”. Preserve that scope distinction:
  commercial availability is not proof that all local/OSS clients need partner
  approval, nor proof that Loom qualifies. [O2, O3, O7]
- The SIWC terms expressly permit requests arising from the authenticated user's
  activity or “expressly authorized automations or background processes” and say
  “Obtain express consent before background use.” They also require requests from
  the user's local runtime or a remote runtime **only that user controls**. [O6]
- Binding limits include: “Any persistent storage of Authentication Tokens must
  be local and under the user's control, not in a remote or managed environment”;
  “Do not provide general-purpose API access for other tools or unrelated
  requests”; and users must not need to pay the app developer to use SIWC.
  Own app identity, supported sign-in, a privacy notice, appropriate security,
  and no pooling/sharing/rotation to bypass limits are explicit requirements. [O6]
- **Architecture interpretation:** a local, user-controlled Loom-only broker can
  fit these requirements in principle; a shared inference gateway, managed token
  vault or subscription serving other users cannot be assumed eligible. Restrict
  the broker to authenticated Loom runs and keep credentials outside Pi. Obtain
  owner/vendor clarification if actual deployment or commercial status is outside
  the documented scope; do not redesign the execution loop to route around it.
- Supported direct inference is `POST https://api.openai.com/v1/responses`.
  The guide explicitly says “do not point it at ChatGPT's `backend-api` endpoints”.
  Requests require `store: false`, `stream: true`, account-available model and
  complete input history; preview restrictions reject various normal API fields
  and hosted tools. Function/custom tools are supported with documented namespace
  rules. OAuth consent must actually grant `chatgpt.tokens.use.direct`; identity
  sign-in alone is insufficient. This is an API transport **billed to eligible
  ChatGPT-plan usage**, not ordinary API-key entitlement. [O3–O5]
- General consumer terms prohibit “Automatically or programmatically extract data
  or Output” and circumventing limits. This is not evidence of a blanket ban on
  the separately documented SIWC flow: use its specific terms and documented
  capabilities, not an inferred exception for arbitrary subscription endpoints.
  Business/API use has the Services Agreement; country, workspace and signed
  agreement can alter the applicable contract. This is technical policy research,
  not a legal conclusion resolving every contractual interaction. [O6, O8, O9]

### OpenAI limits, charges and data

- Codex pricing lists Plus, Pro, Business and Enterprise/Edu access; Free/Go have
  limited desktop rollout, not equivalent CLI/custom-app guarantees. Current
  pricing lists Plus at USD 20/month and Pro at USD 100/200/500; actual local
  billing/taxes and account eligibility remain owner inputs. SIWC docs do not
  establish a universal plan/model eligibility matrix for Loom. [O10, O5]
- Allowances depend on model, speed, context and work; local/cloud usage is shared,
  weekly limits may apply, and optional purchased/workspace credits extend usage.
  Do not convert API token prices into included subscription tasks or promise
  fixed free capacity. SIWC usage may be plan-limited or app-limited; its error
  guide says it does **not** silently switch billing routes. Stop admission on
  limits; late stream failure must not count as successful inference. [O5, O10]
- Consumer terms allow content use for improvement/training with an opt-out.
  Business, Enterprise/Edu and ordinary API data are not used for training by
  default. Codex auth says ChatGPT sign-in follows workspace permissions and
  Enterprise retention/residency, whereas API-key use follows API-organization
  settings. Do not infer API-key privacy merely from the SIWC public API hostname.
  The reviewed SIWC pages do not fully specify plan-specific inference retention,
  training-policy precedence or residency for every custom-app deployment: resolve
  those before allowing confidential data. [O1, O8, O11]
- **Owner data-control requirement (2026-10-22):** training/improvement opt-out is
  required for the personal account. Official control: turn off **Improve the model
  for everyone** in ChatGPT Data controls, or use the Privacy Portal's **Do not
  train on my content**; either suffices for ChatGPT and Codex tasks on a personal
  plan. Codex has a separate **Include environments** setting that the ChatGPT
  toggle does **not** change; verify it is off before Loom sends private
  environment/context data. The opt-out covers new conversations/tasks only, does
  not delete history and does not establish zero retention; safety/abuse retention
  remains. Submitting feedback can enroll the associated conversation. Only the
  owner can apply this in account settings; Loom must not log in or toggle it, and
  must record owner confirmation rather than assume it. [O13, O14]
- Business offers workspace roles/SSO/MFA; Enterprise adds RBAC, provisioning,
  retention/residency, audit and spend controls as eligible/configured. Those
  controls are not automatically present on a personal plan or automatically
  enforced by Pi. Local Loom transcript/log retention is separately Loom's duty.
  `store: false` is required, **not** proof of zero retention: ordinary API
  documentation separately describes abuse logs (normally up to 30 days with
  exceptions), caching, and approval-dependent ZDR/residency. Do not transplant
  these ordinary API guarantees wholesale onto SIWC. [O10–O12]

## Google: eligibility, explicit restrictions and alternatives

- Antigravity FAQ describes personal Google Accounts, approved geographies and
  age 18+. Google One says only personal accounts can subscribe to Google AI
  plans; Workspace purchasing and enterprise services are separate. Paid/trial
  and model eligibility vary. The fetched FAQ and Plans page are not perfectly
  aligned about third-party model availability on Pro versus Ultra; exact model
  eligibility is therefore unresolved, not a reason to pick either plan. [G2–G4]
- **Explicit consumer prohibition, terms §6:** “Using third party software, tools,
  or services to access the Service (e.g. using OpenClaw with Antigravity OAuth)
  is a breach of this Agreement.” Suspension/termination can affect Antigravity
  and/or Gemini CLI accounts. This is not merely a recommendation. [G1]
- FAQ: “Wrapping `agy` inside third-party coding agents or applications, or
  automating account rotation, is not supported under consumer plans.” Its
  permitted direct scripting/CI headless mode is not permission to turn it into
  a Pi provider. [G2]
- Gemini CLI's official terms/privacy page independently says direct access to
  its backing services using third-party software violates applicable terms and
  policies. Apache licensing of CLI source does not license its hosted service.
  The page distinguishes Google-account Code Assist, Gemini Developer API keys
  and Vertex API access, and now announces consumer migration to Antigravity CLI;
  historical CLI subscription quotas are not a current Loom entitlement. [G5]
- Google's recommendation for third-party agents is a Gemini Enterprise or
  AI Studio API key. AI Studio's plan documentation explicitly says direct Gemini
  API/external application use is **billed and managed separately** from Google AI
  subscription UI benefits. Separate promotional Cloud credits may exist, but
  Google One AI credits, Cloud credits and model quota are not interchangeable.
  A future approved API route can preserve Pi; none is selected here. [G2, G6]

### Google limits, charges and data

- Antigravity Pro/Ultra quotas refresh every five hours subject to weekly limits
  and capacity; complex agent work consumes more quota, not one fixed unit per
  prompt. Limits can change. Pro/Ultra may use purchased/promotional AI credits
  for overages at enterprise consumption pricing; the `AI Credit Overages`
  setting offers `Never` or `Always`. Google One page prices were not rendered
  reliably and were localized; no subscription price, fixed quota or zero-charge
  promise is inferred. Flow credits are not asserted to be Antigravity credits.
  These economics do not remove the custom-harness prohibition. [G3, G4]
- Consumer Antigravity terms §§3/5 permit storing interactions/metadata, use for
  Google/Alphabet products and ML improvement, and employee/contractor review;
  users can change data-use preference in settings and request deletion. Reviewed
  terms do not state a numeric retention window, zero-retention commitment or
  consumer residency/admin guarantee. Do not substitute Gemini-app privacy defaults
  or corporate Workspace protections for these Antigravity terms. [G1, G2]
- Enterprise Antigravity is a separate Cloud/administrator agreement: consumer
  additional terms expressly exclude specified Enterprise/Workspace/API-key
  contexts. Official enterprise docs describe SSO/WIF/ADC, IAM/licensing,
  project interaction/telemetry logging, model admin opt-in, VPC controls and
  residency conditions (first-party regional constraints; partner inference
  `global`/`us`/`eu`, not in-country). This does not establish that Loom may use a
  seat's service or that all enterprise logging is disabled. Obtain applicable
  contract and configured retention/training assurances; this review did not
  establish a universal enterprise retention duration. [G1, G7]
- For the **separate** Gemini API, unpaid terms allow improvement and human review
  and warn against sensitive/confidential/personal inputs; paid API access via an
  actively billed Cloud project does not use prompts/responses for improvement,
  but logs them for a limited safety period and may transiently store/cache them
  wherever facilities exist. Regional exceptions and service-specific terms
  matter. A consumer Pro/Ultra purchase alone does not prove paid-API data terms
  or residency. [G8]

## Static pinned Pi integration review

Parent inspected published `@earendil-works/pi-ai` **1.4.0** static files in the
existing external research installation; no module execution or credential reads.
Release source is pinned to
[`4a080252f06caf63a525d7873c5d94d3c23887e0`](https://github.com/earendil-works/pi/tree/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai).
Paths below are relative to that package, not Loom dependencies:

- `dist/providers/openai.js:7–31` supplies **Sign in with ChatGPT** on provider
  `openai`, public `https://api.openai.com/v1`, subscription OAuth and classifier
  filtering for OAuth credentials. `README.md:1785–1795,1865–1871` explicitly
  describes `openai-codex` as legacy, superseded by this route. The user's word
  “Codex” must not select the legacy provider by name alone.
- `dist/auth/oauth/openai-chatgpt.js` uses a dynamically issued client, PKCE/state
  validation and requires `chatgpt.tokens.use.direct`; credentials retain the
  issued client ID for refresh. Its app-name hint is `Pi`. Loom must qualify its
  own app identity/registration rather than assume Pi's identity or consent is
  transferable. No auth flow has been exercised.
- `dist/api/openai-responses.js` sets `stream: true` and `store: false`, and has
  subscription-limit error handling. This is a promising seam, **not conformance**:
  prove account-specific model selection, request-field/tool compatibility,
  terminal-event handling, history, usage and interrupted-stream behavior against
  O3–O5 before enabling it. Static catalogs do not prove account entitlement.
- `dist/providers/openai-codex.js:6–19` targets ChatGPT's private backend;
  `dist/auth/oauth/openai-codex.js` embeds a fixed client identity. This legacy
  path does not satisfy the reviewed SIWC direct endpoint/own-app requirements;
  do not use it as a fallback or borrow official-client credentials.
- No `antigravity` match appeared in inspected package JS/declarations/JSON/README.
  `dist/providers/google.js:5–12` is Gemini **API-key** access, not an Antigravity
  subscription adapter. Absence is scoped to this package/revision; adding an
  adapter would not remove Google's consumer terms restriction.
- `dist/auth/resolve.js` locks automatic OAuth refresh. Once refresh/persistence
  begins it intentionally outlives caller cancellation, with a 15-second refresh
  timeout. A future host broker must separate credential maintenance from inference
  admission: kill prevents new dispatch, not a false promise of undoing refresh or
  an already-dispatched request. No provider tokens enter the isolated runner.
- Both OAuth modules can include raw token-endpoint error bodies in exceptions;
  legacy missing-field errors also stringify partial token JSON. Never persist or
  forward raw exceptions/causes to runner, logs or artifacts. Owned broker errors
  require fail-closed redaction and synthetic sentinel tests before live use.

No installed package change, Loom provider implementation, dependency promotion or
live integration proof follows. Keep a narrow Loom-only local broker, no generic
proxy, token pooling, account rotation, silent billing/provider/model fallback or
quota consumption without express authorization.

## Required inputs and remaining proof

**Owner clarification — 2026-10-22:** personal OpenAI account; GPT-6.1 Sol as the
initial model candidate (`gpt-6.1-sol`), confirmed available by the owner on that
account (owner attestation; no API check or live call performed). The identifier
also appears in the public SIWC example [O4]. Private source code may be sent;
a training/improvement opt-out is required; no additional owner-imposed retention
or residency restrictions for now. This is a
qualification profile, not a provider/model dependency in Loom's
authority/workflow/verification. Each enabled
provider/model still needs explicit selection and conformance; no silent fallback.
Vendor terms and secret hygiene remain mandatory. Private-code permission does
not authorize credentials, unrelated customer/personal data or live calls. No
personal-plan no-training or zero-retention guarantee is inferred.

1. Owner: exact OpenAI subscription tier, country/serving
   region, model speed, local/OSS versus paid/managed distribution, and
   whether any other user's work can trigger inference.
2. Developer: verify applicable personal-account agreement and SIWC eligibility,
   exact model availability and document actual data handling before live use.
   Model availability is owner-attested; plan tier and data handling are not.
   Synthetic/public inputs and owner-authorized private source are allowed data
   classes; secrets and unrelated personal/customer data remain excluded. No
   extra owner-imposed data restrictions does not waive vendor or legal duties.
3. Owner: apply and confirm the training/improvement opt-out in ChatGPT Data
   controls or the Privacy Portal, and verify Codex **Include environments** is
   off before private environment context is sent. This is an account action;
   Loom must not log in or toggle it. The installed `codex-cli 0.163.0` check
   found no account data-control setting; local `include_environment_context=true`
   is a prompt-context flag, not proof of the account state. Opt-out does not
   prove zero retention.
4. Owner: separate express approval for OAuth/login and background automation;
   live quota consumption, maximum requests/tokens/time and credit/spend ceiling;
   whether existing credits may be consumed. No silent paid/API/Google fallback.
5. Developer: reconcile pinned Pi provider transport/body/stream/tool/usage seams
   with **SIWC direct** requirements, implement only after authorization, then
   prove broker isolation, authorization, cancellation, redaction and accounting.
   Adapter existence is neither vendor permission nor conformance evidence.

**Verification/limits:** zero live model calls; no login, token/cache inspection,
private endpoint probing, installs or provider tests. Public fetches establish
published claims only, not account rollout or quota. Search integration was
unavailable; direct official links were followed instead. One guessed Codex data
page returned 404; privacy conclusions use the cited terms/auth/data sources and
explicitly retain SIWC-specific unknowns. No full automated secret scan or legal
review claimed. Document whitespace/reference validation is recorded by the parent
task; no application test is applicable to this research-only addition.

## Official sources

All following URLs were fetched 2026-10-22; pages are mutable, not revision-pinned.

- **O1:** https://developers.openai.com/codex/auth/
- **O2:** https://developers.openai.com/siwc/token-sharing-open-source.md
- **O3:** https://developers.openai.com/siwc/token-sharing-open-source/sign-in.md
- **O4:** https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md and https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations.md
- **O5:** https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery.md and https://developers.openai.com/siwc/ui-ux-guidelines.md
- **O6:** https://openai.com/policies/sign-in-with-chatgpt-terms/ (2026-09-29); https://openai.com/policies/service-terms/ (§15, updated 2026-10-16).
- **O7:** https://developers.openai.com/siwc/request-client-id.md
- **O8:** https://openai.com/policies/terms-of-use/ (effective 2026-01-01; links separate EEA/Swiss/UK terms).
- **O9:** https://openai.com/policies/business-terms/ (returns Services Agreement, effective 2026-01-01).
- **O10:** https://developers.openai.com/codex/pricing.md
- **O11:** https://openai.com/business-data/
- **O12:** https://developers.openai.com/api/docs/guides/your-data.md
- **O13:** https://help.openai.com/en/articles/7730893-data-controls-faq (mutable; fetched 2026-10-22)
- **O14:** https://openai.com/policies/how-your-data-is-used-to-improve-model-performance/ (updated 2026-03-13; fetched 2026-10-22)
- **G1:** https://antigravity.google/terms
- **G2:** https://antigravity.google/docs/faq
- **G3:** https://antigravity.google/docs/plans/
- **G4:** https://one.google.com/about/google-ai-plans/ (returned localized public plan page; no account inference).
- **G5:** https://geminicli.com/docs/resources/tos-privacy (page labels last update 2026-04-10).
- **G6:** https://ai.google.dev/gemini-api/docs/google-ai-plans (last updated 2026-10-16).
- **G7:** https://antigravity.google/docs/enterprise/
- **G8:** https://ai.google.dev/gemini-api/terms (effective 2026-03-23; last updated 2026-04-28).
