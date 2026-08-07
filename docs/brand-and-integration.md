# NMAO — Brand Kit & Member-Platform Integration

*Pulled from the existing `NMAO-Membership-Platform` repo (2026-08-06) so the four apps stay consistent with what's already shipped.*

## Brand kit (from the member platform `styles.css`)

Aesthetic: dark, elegant, gold-accented, serif — a premium feel.

**Colors**
- Background: `#080808` (black), near-black `#111111`, card/surface `#141414`, border `#222222`
- Accent (primary): gold `#C9A84C`, light gold `#E2C06E`, dark gold `#8B6914`, gold wash `rgba(201,168,76,0.07)`
- Text: `#F5F0E8` (warm white), muted `#7A7060`
- Status: green `#5A9A6A`, red `#9A5A5A`, blue `#5A7A9A`

**Type**
- Display / headings: **Libre Baskerville** (serif)
- Body: **Cormorant Garamond** (serif)
- UI / labels / buttons: **Lato** (sans), uppercase with wide letter-spacing

The four apps (school, competitor, judge, viewer) and the operator mission-control web app should adopt this palette + type so the suite reads as one brand.

## Member-platform integration (the shared spine)

The member platform is already built and is the **system of record for rank**. Its schema includes a full belt model we can read from:

- `belt_systems` — a school's belt/rank system (styles differ)
- `belt_levels` — the ordered belts within a system (has `classes_required`)
- `belt_tests`, `belt_test_students`, `belt_promotions` — testing & promotion history
- `programs` (with `belt_system_id`), `classes`, `memberships`, `student_memberships` — the operations layer
- `school_subscription_tiers`, `platform_config` — plan/config

**Rank → tournament tier (F3).** Because belt systems vary by style, add a **tier designation per `belt_level`** (beginner / intermediate / advanced / black_belt). The school sets this mapping once; the tournament then auto-seeds each competitor's `declared_rank` from their current belt's tier. Implementation options: a `tier` column on `belt_levels`, or a `belt_level_tiers(belt_level_id, tier)` mapping table on the tournament side. To finalize when we build the school app + member↔tournament sync.

**"Classes 1-4" (F5) — resolved.** "Classes" is the member platform's **class-scheduling** domain (`classes`, `membership_classes`, `class_limit_count`, class reminders). Not a tournament concept; nothing to reconcile. Dropped.

**Pricing (F2) — confirmed.** Member platform: **$99/mo** (waived with accreditation) **+ 1% transaction fee capped at $200/mo**.

**Privacy / terms.** The member repo has `privacy.html` and `terms.html`; adapt these for the tournament apps and add the COPPA/video **waiver** (indefinite storage, promotional-use-only, guardian delete rights).
