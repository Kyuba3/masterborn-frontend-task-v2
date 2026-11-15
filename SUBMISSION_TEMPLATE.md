# Submission: Jakub Kołodziej

## Time Spent

Total time: **around 4 hours**

## Ticket Triage

### Tickets I Addressed

| Ticket  | Changes                                                                                     |
| ------- | ------------------------------------------------------------------------------------------- |
| CFG-142 | Fixed async pricing races and prevented cart actions with stale or invalid results.         |
| CFG-148 | Fixed the Packaging dependency crash and inconsistent add-on state.                         |
| CFG-147 | Fixed shared URLs, Unicode encoding, payload validation and configuration-name persistence. |
| CFG-152 | Improved keyboard accessibility, form controls and modal focus handling.                    |
| CFG-143 | Fixed resize listener cleanup and stale preview updates.                                    |
| CFG-151 | Replaced technical errors with helpful messages and improved retry handling.                |

**Also covered:** CFG-149's loading feedback works with the corrected pricing state. CFG-156's reported lists have keys. CFG-158's configuration objects are memoized, although performance gains have not been measured.

### Tickets I Deprioritized

| Ticket  | Reason                                                                                      |
| ------- | ------------------------------------------------------------------------------------------- |
| CFG-146 | Minor timezone issue not reproduced.                                                        |
| CFG-150 | Missing reference screenshot; no confirmed mobile layout defect.                            |
| CFG-153 | Multiweek feature, outside the task's scope.                                                |
| CFG-155 | Dark mode requires broader design and CSS changes.                                          |
| CFG-157 | Full unsaved-changes confirmation flow deferred; existing dirty-state bug fixed separately. |

### Tickets That Need Clarification

| Ticket        | Reason                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| CFG-144 / 145 | Conflicting requests to remove Quick Add and add a mandatory demo shortcut. Kept the existing feature unchanged. |
| CFG-154       | Conflicting discount thresholds and rates. Financial rules need Product/Finance approval.                        |

### Tickets With a Misleading Priority Label

| Ticket  | Board   | My Assessment                                 |
| ------- | ------- | --------------------------------------------- |
| CFG-152 | Low     | High — accessibility is a client requirement. |
| CFG-154 | Unclear | Requires urgent business clarification.       |
| CFG-153 | Medium  | Defer — estimated at 2–3 weeks.               |

### Tickets Where You Stopped to Ask Instead of Implementing

CFG-144/145 requires a decision from Product and Customer Success; CFG-154 requires Product/Finance confirmation. No approvals were assumed.

---

## Technical Write-Up

### Critical Issues Found

#### Issue 1: Pricing race conditions — CFG-142

The pricing hook compared incompatible timestamps, causing valid responses to be discarded. Overlapping requests could also produce stale prices and loading states.

I replaced timestamp-based checks with request tracking and cleanup, and ensured cart actions use only current, validated pricing.

#### Issue 2: Packaging dependency crash — CFG-148

Disabling Packaging left dependent add-ons selected, causing the summary to access missing data.

I updated selections and add-ons together, removing unavailable dependencies and safely handling restored configurations.

#### Issue 3: Broken shared URLs — CFG-147

The original Base64 encoding failed with Unicode characters, while URL handling and insufficient validation caused incorrect restoration.

I added UTF-8-safe encoding, backward-compatible decoding, payload validation and configuration-name persistence.

### Other Changes Made

- Improved accessibility with native controls, keyboard navigation and modal focus management.
- Fixed resize listener cleanup and outdated preview updates.
- Added user-friendly error messages and safer retries.
- Corrected dirty-state tracking and preview URL parameters.

---

## Code Quality Notes

### Things I Noticed But Didn't Fix

| Issue                | Reason                                   |
| -------------------- | ---------------------------------------- |
| Monolithic component | Refactoring would add regression risk.   |
| Existing `any` types | Outside the scope of the targeted fixes. |

### Potential Improvements for the Future

1. Add permanent regression tests to CI.
2. Profile long-session performance and complete a wider accessibility audit.

---

## Questions for the Team

1. Can QA provide reproduction details for CFG-146 and CFG-150?
2. What browser and accessibility support is required for embedded widgets?

---

## Assumptions Made

1. Dependent add-ons should be removed when their prerequisites become unavailable.
2. Invalid shared configurations should safely fall back to defaults.

---

## Self-Assessment

**What went well?** I focused on the most important bugs rather than trying to complete every ticket.

**What was challenging?** Tracking down the pricing race condition and deciding how to handle conflicting requirements.

**What would you do differently with more time?** Add regression tests to CI and investigate the remaining performance and accessibility issues.

---

## AI Assistance Notes

I used Codex to help with implementation and testing, and ChatGPT to discuss priorities and review potential issues. I reviewed the changes myself and made the final decisions on what to fix, defer or leave for clarification.

---

## Additional Notes

The build and TypeScript checks pass. I also tested the main user flows manually and used local regression tests to check the fixes. The test suite is not included in the submission.
