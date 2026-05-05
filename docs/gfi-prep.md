# GFI CTO meeting prep

Internal doc for Vick. AFF is a sub-agency under GFI; the meeting is with
GFI's CTO. Don't share this externally.

## Frame in the first 5 minutes

> "We're really excited to show you what we've built. Before we dive in, I
> want to mention that we see this as a chance to think together about how
> AFF can be a model for what an agency can do inside GFI, and what kind of
> structural support would unlock that. We can come back to that at the end."

This sets expectations: we are not auditioning for free integration work,
we're showing what's possible and we expect to talk about how AFF
participates in the upside. Said up front, the structural conversation at
the end won't catch them off guard.

## Demo: what to show, what to skip

**Show generously** (outcome-visible, not implementation-IP):
- Agent home dashboard (trading-card, milestones, downline view)
- Recruiter genealogy / org chart
- Flyer-to-Discord training pipeline (live demo: drop a flyer, watch the
  embed appear in the channel)
- Contact pipeline + classification (Business Partner Prospect, FTA, etc.)
- Resources / Vault as an agent sees it
- New Business tracker

**Skip / decline politely if asked:**
- Anything in `/vault/settings` (admin internals)
- The data model, schema, migrations
- The AI prompts that drive flyer parsing
- API route walkthrough
- Source code, Loom recordings, GitHub access
- "Send us the spec so our team can scope integration" (THE absorption ask)

If asked: "That's our build side. We'd want to keep that one bucket
separate and talk about it as part of the broader conversation about how
AFF and GFI work together going forward."

## The asks, in priority order

1. **Designated Model Agency / Innovation Partner status.** Formal
   designation that GFI markets to other agencies. Single biggest unlock
   for AFF recruiting.
2. **Tevah API / data access** for AFF's tech team. Read access to comp
   grid, policy status, carrier pipelines.
3. **First-look on new carriers, products, and Tevah features** before
   they roll to other agencies (30 to 60 day head start).
4. **Quarterly product roadmap input** with Tevah's team. Defends against
   absorption by keeping AFF in the room when Tevah plans.
5. **Co-branding** on any AFF-originated feature absorbed into Tevah
   ("Powered by AFF" or similar) for a defined window, e.g. 12 months.
6. **Override / comp recognition bump** for AFF leadership in exchange
   for the innovation contribution.

Lead with #1, not #6. Asking for money first inside the family reads
badly. The political asks pay more than the financial one anyway.

## What you don't agree to on this call

- Any timeline for integration work
- Any handoff of code, schemas, or documentation
- Any "let's have our teams sync" without a structural agreement first
- Any meeting with Tevah engineering before a meeting with GFI's CEO

If pushed: "Yes, absolutely, that's the kind of thing I want to map out
together. Let me come back with a proposal for how AFF and GFI structure
this so it's a win for both sides."

## Phrases worth memorizing

- **When they're impressed:** "Thank you, we've put a lot into it. The
  team's small but fast." (Plants the speed-gap moat without bragging.)
- **When they probe implementation:** "We can definitely talk about
  that. I'd want to scope it inside the broader conversation we're
  having about AFF's role." (Defers without refusing.)
- **When they propose absorption:** "I love that direction. The piece I'd
  want to make sure we get right is how AFF gets credit and continues to
  lead on this surface, since it's a big part of how we recruit."
  (Frames absorption as needing recognition.)
- **When they say "we'll have our team take a look":** "Great. Before
  they dig in, can we sketch out what AFF gets in return at a high level?
  It'll save your team and mine some back-and-forth." (Forces the
  structural conversation upstream.)

## Closing move

End with: "Let me put together a short doc with how I think we structure
this so AFF can keep building, GFI gets the benefit, and our agents see
real differentiation. Can I send it to you and to [GFI CEO] later this
week?"

This gets you a written follow-up, gets the GFI CEO copied (so the deal
isn't trapped at the CTO level), and puts you in control of the doc that
frames the negotiation.

## Risks to be honest about

- The aggressive-NDA / licensing-fee posture from peer-vendor playbooks
  doesn't apply here. You can't shake down your parent. The currency is
  recognition and structural advantage, not dollars.
- The real "brain rape" risk in this dynamic isn't code theft, it's that
  Tevah's team absorbs the ideas into their roadmap over 12 to 18 months
  and ships AFF's features as Tevah features to all the other agencies,
  with AFF getting a thank-you and a pat on the back. Defense: lock in
  recognition + co-branding + first-look BEFORE any integration work.
- The speed gap is the real moat. AFF can ship in 90 days what Tevah
  takes 18 months to build through committee. Don't say it out loud,
  but it's why generosity-plus-asks works: by the time they could
  replicate, you're already two iterations ahead.
