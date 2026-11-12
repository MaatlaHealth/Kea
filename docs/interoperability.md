# Interoperability

> **No interoperability certification or conformance testing has been carried
> out.** What follows is the route to it, and the design decisions that make
> that route tractable. It is not a claim that an integration exists.

## Why there is no FHIR layer today

A pilot does not need one. Adding a FHIR facade before there is a system to
integrate with would mean maintaining a mapping nobody exercises, and would
expand the security surface for no present benefit.

What a pilot does need is to not be painted into a corner. That is what the
boundary below is for.

## The adapter boundary

The referral engine never serves or consumes an external representation.
Everything outside the application goes through an adapter:

```
  external system
        │
        ▼
  ┌──────────────┐   maps between an external resource and Kea's own input
  │   adapter    │   types. Contains no workflow logic.
  └──────┬───────┘
         ▼
  ┌──────────────────────────────┐
  │ services                      │  createReferral, transitionReferral,
  │ (src/lib/*/service.ts)        │  registerPatient. Enforce the state
  └──────┬────────────────────────┘  machine, authorisation and audit.
         ▼
  ┌──────────────┐
  │  PostgreSQL  │
  └──────────────┘
```

The property that matters: **a service function is the only way to change a
referral.** An adapter cannot write a status directly, cannot skip the state
machine and cannot bypass the authorisation check, because those live inside
the service, not in the route that called it. An integration that tried to
move a referral from `submitted` to `closed` would be refused exactly as a
user would be.

## Mapping Kea to FHIR R4

The resources an integration would need, and where the data already lives.

| FHIR resource | Kea source | Notes |
| --- | --- | --- |
| `Organization` | `organisations`, `facilities` | Facilities map to `Organization` with `partOf` the owning organisation, or to `Location` where a physical site is meant. |
| `Patient` | `patients`, `patient_identifiers` | `identifier` from the record number and any additional identifiers. `communication` from preferred language. `telecom` from the phone numbers. |
| `EpisodeOfCare` | `pregnancy_episodes` | One active episode per patient, which matches the FHIR expectation of a single active episode for a condition. |
| `ServiceRequest` | `referrals` | The central mapping. `intent` is `order`, `priority` maps from routine, urgent and emergency, `requester` from the creating user, `performer` from the receiving facility, `reasonCode` from the reason category. |
| `Task` | `referrals` plus `referral_status_events` | A FHIR `Task` tracking fulfilment of the `ServiceRequest` is a closer fit for Kea's state machine than `ServiceRequest.status` alone, which has far fewer states. |
| `Appointment` | `appointments` | `status` maps from scheduled, rescheduled, attended (`fulfilled`), missed (`noshow`) and cancelled. |
| `Encounter` | `encounters` | Screening and clinical visits. |
| `Communication` | `messages` | Outbound and inbound patient messages, with delivery status. |
| `Consent` | `consent_records` | One `Consent` per category, with `provision.type` from granted or withdrawn. |
| `Provenance` / `AuditEvent` | `audit_events` | Kea's audit model is already close to `AuditEvent`: actor, action, entity, outcome, time. |

### Where the mapping is not clean

Three places need a decision rather than a lookup, and an implementer should
expect to argue about them:

1. **Kea has fifteen referral states; `ServiceRequest.status` has eight.**
   Mapping the exception states (`missed_appointment`, `unable_to_contact`,
   `escalated`) onto `on-hold` loses the distinction that makes Kea useful.
   The recommended approach is a companion `Task` whose `businessStatus`
   carries Kea's state, with `ServiceRequest.status` kept coarse.

2. **Coordination tasks have no obvious FHIR home.** They are operational,
   not clinical. A `Task` with a local category code is the pragmatic answer,
   but it will not be meaningful to a receiving system that does not know Kea.

3. **The prediction score must not be exported as an `Observation` or a
   `RiskAssessment`.** It is not clinical, it is not validated, and a
   `RiskAssessment` resource arriving in a clinical system carries an
   authority it has not earned. If it is exported at all, it should be in a
   local extension that a receiving system must opt into.

## Terminology

Referral reason categories are currently a fixed local list in
`src/lib/site.ts`. Mapping them to SNOMED CT or ICD-10 is a clinical exercise,
not a technical one, and it should be done with the deploying service rather
than guessed here. The schema stores the category as text, so adding a coded
value alongside it is an additive migration.

## What an implementation would involve

1. Agree the resource profiles and the state mapping with the receiving
   system.
2. Write `src/lib/interop/fhir/` with pure functions mapping between FHIR
   resources and the service input types. No database access, no workflow.
3. Add an authenticated route group that calls the existing services through
   those mappers. SMART on FHIR or mutual TLS, depending on the counterparty.
4. Add contract tests against the official FHIR validator.
5. Run conformance testing with the counterparty.
6. Only then describe the integration as existing.

Steps two and three are small because step zero was done: the referral engine
has no opinion about who called it.

## South African context

The National Health Normative Standards Framework for Interoperability in
eHealth (HNSF) and the Health Patient Registration System (HPRS) are the
relevant national pieces. An HPRS identifier would map to
`patient_identifiers` with a system of `hprs`, which requires no schema
change. We have not tested against either, and we do not claim compatibility.
