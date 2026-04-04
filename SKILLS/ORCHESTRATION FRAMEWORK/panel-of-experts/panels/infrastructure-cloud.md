---
name: panel-infrastructure-cloud
description: Expert panel for IaC review, cloud architecture, networking, cost optimization, and environment parity
aliases: [infrastructure-panel, cloud-panel, iac-panel, terraform-panel, infra-review]
category: orchestration
tags: [infrastructure, cloud, terraform, iac, networking, cost-optimization, kubernetes]
version: 1.0.0
requires: [panel-of-experts]
resolutionHints:
  - infrastructure as code review
  - cloud architecture design
  - networking or security group changes
  - Terraform or Pulumi or CDK review
  - cost optimization review
  - container orchestration design
  - environment parity assessment
---

# Infrastructure & Cloud Architecture Panel

## Panel Composition

| Expert | Role | Primary Lens |
|---|---|---|
| **Hassan Al-Rashid** | Cloud Infrastructure Architect | Cloud topology, reliability, blast radius, networking |
| **Lin Wei** | IaC & Platform Engineering Lead | IaC quality, state management, modularity, testability |
| **Natasha Petrov (Infra)** | Site Reliability Engineer | Operational readiness, deployment, monitoring, rollback |
| **James Okafor (Cloud)** | Cloud Security & Networking Specialist | Least-privilege IAM, network boundaries, secrets management |
| **Maria Santos** | Cost & FinOps Engineer | Right-sizing, reserved/spot, lifecycle policies, cost attribution |

See [expert-roster.md](../expert-roster.md) for full persona definitions.

## When to Invoke

- New cloud resource provisioning or architecture design
- IaC module design or major refactoring (Terraform, Pulumi, CDK)
- Networking changes (VPC, subnets, security groups, load balancers)
- Container orchestration design (Kubernetes, ECS, Fargate)
- CI/CD infrastructure changes
- Cost optimization reviews or FinOps assessments
- Environment promotion strategy (dev/staging/prod parity)
- Multi-region or disaster recovery architecture

## Review Modes

### Mode A: Architecture Review
Evaluate cloud architecture for reliability, security, cost, and operational readiness.

### Mode B: IaC Code Review
Review infrastructure-as-code for modularity, safety, state management, and best practices.

### Mode C: Cost & Efficiency Review
Assess cloud spending for right-sizing, waste elimination, and cost attribution.

---

## Review Protocol

### Step 1: CONVENE -- Select Mode and Experts

| Mode | Active Experts |
|---|---|
| Architecture Review | Hassan, James (Cloud), Natasha (Infra), Maria |
| IaC Code Review | Lin, Hassan, James (Cloud) |
| Cost & Efficiency Review | Maria, Hassan, Natasha (Infra) |

### Step 2: BRIEF -- Present the Artifact

**For Architecture Review (Mode A):**
```
## Architecture Under Review
- **Cloud Provider(s):** [AWS, GCP, Azure, multi-cloud]
- **Topology:** [regions, AZs, VPCs, accounts]
- **Compute:** [EC2, ECS, EKS, Lambda, etc.]
- **Storage:** [S3, RDS, DynamoDB, etc.]
- **Networking:** [VPC layout, peering, transit gateway, CDN]
- **Reliability Requirements:** [SLA target, RTO, RPO]
- **Traffic Pattern:** [requests/sec, burst profile, geographic distribution]
- **Compliance Requirements:** [SOC2, HIPAA, PCI, data residency]
```

**For IaC Code Review (Mode B):**
```
## IaC Under Review
- **Tool:** [Terraform, Pulumi, CDK, CloudFormation]
- **Files/Modules:** [file paths or module names]
- **Resources Created:** [summary of what's being provisioned]
- **State Backend:** [where state is stored]
- **Variables/Inputs:** [key configuration parameters]
- **Environments:** [which environments this applies to]
- **CI/CD Pipeline:** [how this is applied -- manual, automated, PR-gated]
```

**For Cost & Efficiency Review (Mode C):**
```
## Cost Review
- **Monthly Spend:** [current total, by service]
- **Growth Trend:** [month-over-month, projected]
- **Top Cost Drivers:** [which resources cost the most]
- **Reservation Coverage:** [percentage of compute on RI/SP]
- **Idle Resources:** [known unused or underutilized resources]
- **Cost Attribution:** [how costs are tagged and allocated]
- **Budget Constraints:** [target budget, hard limits]
```

### Step 3: SOLO -- Independent Expert Reviews

**Hassan Al-Rashid (Cloud Infrastructure Architect) reviews:**
- Blast radius -- what's the blast radius if this AZ goes down? If this region goes down?
- Network topology -- why is this resource in a public subnet? Is the VPC layout debuggable?
- Reliability design -- are blast radiuses contained? Is there appropriate redundancy without over-engineering?
- Scaling strategy -- is auto-scaling configured? Are scale-up and scale-down thresholds appropriate?
- Service selection -- is the right cloud service chosen for the use case, or are we defaulting to familiar services?
- Cross-region strategy -- if multi-region is needed, is data replication conflict-free?
- Disaster recovery -- what's the RTO and RPO, and does the architecture actually achieve them?
- "If I terminate the largest instance in this architecture right now, what happens to users?"

**Lin Wei (IaC & Platform Engineering Lead) reviews:**
- Modularity -- is this module reusable, or will it be copy-pasted across environments?
- State management -- is state stored securely with locking? Can partial applies corrupt state?
- Idempotency -- what happens if `terraform apply` is interrupted halfway through and re-run?
- Secrets handling -- how are secrets managed in this configuration? Are they in state files?
- Variable hygiene -- are defaults sensible? Are required variables validated?
- Drift detection -- how do you detect manual changes that drift from the IaC definition?
- Testing -- are there plan tests, policy checks, or integration tests for this IaC?
- "Can a junior engineer safely apply this to production, or does it require tribal knowledge?"

**Natasha Petrov (Infra) (Site Reliability Engineer) reviews:**
- Deployment safety -- how do you roll this infrastructure change back if it causes an outage?
- Monitoring coverage -- what alerts fire if this resource becomes unhealthy?
- Operational runbooks -- can on-call debug this infrastructure at 3 AM without the author?
- Log aggregation -- are logs from these resources centralized and searchable?
- Access for debugging -- can engineers access these resources for troubleshooting without breaking security boundaries?
- Change management -- is there a change approval process for production infrastructure changes?
- Dependency health -- what upstream infrastructure dependencies could silently fail?
- "Walk me through the on-call experience: this resource is unhealthy at 3 AM. What does the engineer see, and what do they do?"

**James Okafor (Cloud) (Cloud Security & Networking Specialist) reviews:**
- IAM permissions -- why does this role have `*` permissions? Is this least-privilege?
- Network boundaries -- where are the trust boundaries, and is traffic encrypted crossing them?
- Ingress/egress rules -- are security groups and NACLs minimally permissive?
- Secrets management -- where are secrets stored, rotated, and accessed?
- Public exposure -- is anything publicly accessible that shouldn't be?
- Audit logging -- are CloudTrail/audit logs enabled for these resources?
- Compliance alignment -- does this configuration meet the stated compliance requirements (SOC2, HIPAA, etc.)?
- "If an attacker compromises this IAM role, what's the maximum damage they can do?"

**Maria Santos (Cost & FinOps Engineer) reviews:**
- Right-sizing -- are these instances/resources sized appropriately for actual utilization?
- Reserved capacity -- should any of these resources be on Reserved Instances or Savings Plans?
- Spot opportunity -- can any workloads tolerate interruption and use Spot instances?
- Lifecycle policies -- are there lifecycle policies on storage resources to archive or delete old data?
- Cost attribution -- are resources tagged for cost allocation by team/project/environment?
- Unused resources -- are there any resources provisioned but not actively used?
- Growth modeling -- what's the estimated monthly cost, and have you modeled 6-month growth?
- "What's the estimated monthly cost of this architecture, and who owns the budget approval?"

### Step 4: CHALLENGE -- Cross-Expert Debate

Key challenges for this panel:

1. **Hassan vs Maria:** "Multi-AZ with hot standby is required for this SLA" vs "That redundancy costs 2x and the SLA doesn't justify it"
2. **Lin vs Natasha (Infra):** "All infrastructure changes must go through IaC, no exceptions" vs "Sometimes you need to `kubectl exec` in production to diagnose an issue"
3. **James (Cloud) vs Lin:** "Every change needs a security review ticket" vs "Developers need to iterate on infrastructure without a 3-day security approval cycle"
4. **Hassan vs James (Cloud):** "This service needs a public endpoint for the CDN" vs "Nothing should be in a public subnet, use a private link"
5. **Maria vs Natasha (Infra):** "Downsize these instances to save 40%" vs "Those instances need headroom for traffic spikes and we can't auto-scale fast enough"

### Step 5: CONVERGE -- Synthesize Findings

```markdown
## Infrastructure & Cloud Architecture Panel Report

### Overall Assessment: [APPROVED / APPROVED WITH MODIFICATIONS / NEEDS REWORK]

### Architecture Findings
1. **[Resource/Decision]** -- verdict: [accept/modify/reject], rationale: [why]

### Security Assessment
1. **[Finding]** -- severity: [critical/high/medium/low], remediation: [approach]

### IaC Quality
1. **[Module/Pattern]** -- verdict: [accept/modify/reject], rationale: [why]

### Risk Register
| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| [Risk 1] | [H/M/L] | [H/M/L] | [approach] | [who] |

### Cost Summary
- Estimated monthly cost: [$X]
- Optimization opportunities: [$Y savings identified]
- Recommended actions: [right-size, reserve, lifecycle policy]

### Operational Readiness
- Monitoring: [adequate/gaps identified]
- Runbooks: [exist/needed]
- Rollback: [tested/untested/not possible]

### Dissenting Opinions
1. [Expert] argued [position] -- [rationale]
```

### Step 6: FEASIBILITY -> DELIVER

Top recommendations and alternative approaches go to [Feasibility Panel](feasibility-research.md).

## Example Invocations

### Architecture Review
```
Run an Infrastructure & Cloud Architecture Panel -- Mode A -- on our
proposed multi-region deployment for the payments service.

We're deploying to AWS us-east-1 and eu-west-1 with Aurora Global
Database, ECS Fargate behind ALBs, and CloudFront for static assets.
Target SLA is 99.95% with RTO of 15 minutes.

Key concerns:
- Is the multi-region topology correct for our SLA target?
- What's the blast radius if us-east-1 has an AZ failure?
- Are the network boundaries secure for PCI compliance?
- What's the estimated monthly cost vs single-region?

Full Mode A panel. Include feasibility gate.
```

### IaC Code Review
```
Run Mode B on our new Terraform module for provisioning EKS clusters.

The module creates a VPC, EKS cluster, managed node groups, and
associated IAM roles. It's parameterized for dev/staging/prod
environments with different node sizes.

Key concerns:
- Is the module reusable and testable?
- Are secrets handled correctly (no plaintext in state)?
- What happens if apply is interrupted during node group creation?
- Can a new engineer safely use this module?
```

### Cost Review
```
Run Mode C on our AWS account. Current monthly spend is $47K, up
from $31K six months ago. Top drivers are RDS ($12K), EC2 ($11K),
and S3 ($8K).

Key concerns:
- Are RDS instances right-sized for actual utilization?
- Should we move to Reserved Instances given stable usage?
- Is there S3 data that should be on Glacier or have lifecycle policies?
```
