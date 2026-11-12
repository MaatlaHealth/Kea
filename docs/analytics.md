# Analytics

Every figure is calculated from stored referral events. The formula for each
one is shown beside it on the analytics screen and written out here, so a
programme manager can reconcile a number without reading SQL.

Source: `src/lib/analytics/queries.ts`.

## Scope

A figure covers the facilities the user may read analytics for. An
organisation wide role sees the whole organisation; a facility role sees its
own facility. A referral is in scope if either its referring or its receiving
facility is in scope.

The default period is the last 90 days, selectable as 30, 90, 180 or 365. The
period filters on the date a referral was **created**, except where stated.

## Disclosure control

Any rate whose denominator is below **five** is withheld and shown as
"Suppressed". Counts are still shown. A rate over a handful of referrals can
identify an individual, particularly in a small facility.

The threshold is `SMALL_CELL_THRESHOLD`. It applies on the screen, in the
facility breakdown and in the CSV export.

## Headline figures

| Figure | Calculation |
| --- | --- |
| Referrals created | Count of referrals created in the period, including drafts. |
| Submitted | Of those, the count with a submission timestamp. |
| Acknowledged | Of those, the count with an acknowledgement timestamp. |
| Appointments booked | Of those, the count with a first appointment timestamp. |
| Care completed | Of those, the count with a care completed timestamp. |
| Pathways closed | Of those, the count whose current status is `closed` or `follow_up_completed`. |

These are cumulative markers on the referral row, not transitions, so a
referral that was rebooked twice still counts once.

## Rates

**Completion rate**

```
referrals created in the period whose status is closed or follow_up_completed
-------------------------------------------------------------------------------
referrals created in the period that were submitted
```

Suppressed when the denominator is below five.

**Acknowledgement rate**

```
referrals created in the period with an acknowledgement timestamp
------------------------------------------------------------------
referrals created in the period that were submitted
```

**Median acknowledgement time**

The 50th percentile, by `percentile_cont`, of

```
(acknowledged_at - submitted_at) in hours
```

over referrals created in the period that have both timestamps. The median is
used rather than the mean because one referral acknowledged after three weeks
would otherwise dominate.

**Missed appointment rate**

```
appointments scheduled in the period with status missed
----------------------------------------------------------
appointments scheduled in the period with status missed or attended
```

Note the denominator: appointments still in the future, cancelled or awaiting
an attendance decision are excluded, because including them would understate
the rate early in a period.

This figure filters on the **appointment date**, not the referral creation
date.

**Follow-up completion**

```
follow up tasks created in the period with status resolved
-------------------------------------------------------------
follow up tasks created in the period
```

Counts tasks of kind `follow_up_due` and `clinical_follow_up`.

## Referral volume by week

Referrals grouped by `date_trunc('week', created_at)`, with three series:
created, those that reached acknowledgement, and those that reached a closed
outcome. The second and third series are cumulative state as at the time of
the query, not events that happened within that week, so the gap between the
lines narrows as older weeks resolve.

## Where open referrals are sitting

A count of referrals in each open status, with no date filter: the question is
"what is open right now". Terminal statuses are excluded. The median age uses
`updated_at`, so it measures time since the last change rather than time since
creation.

## By receiving facility

For each receiving facility, over referrals created in the period: submitted,
acknowledged, completed, median acknowledgement hours and completion rate.

A row with fewer than five submitted referrals shows its counts and suppresses
its rate and median.

## Exception events

Counts of transitions **into** each exception status during the period:
`rejected`, `cancelled`, `missed_appointment`, `unable_to_contact`,
`escalated`.

This counts events, not referrals, so a referral that was escalated twice
appears twice. That is intentional: the question is how often the exception
happened, not how many referrals it happened to.

## Export

`GET /api/analytics/export?range=90` returns a CSV with sections `period`,
`headline`, `facility`, `open_by_status` and `exception_events`. It contains
no patient identifier, no name and no referral reference, and it applies the
same suppression. The download is audited.

Requires `analytics:export`, held by organisation administrators, facility
administrators and programme analysts.

## What these figures are not

They describe how the referral service is operating. They are not clinical
outcome measures. They say nothing about maternal or neonatal outcomes, and
nothing about the quality of care given.

No output from the prediction service appears anywhere in analytics. An
experimental score must not become a population health statistic.
