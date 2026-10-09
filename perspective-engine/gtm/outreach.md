# Perspective Engine: Outreach Sequence Drafts (V08, as of 2026-10-06)

## Summary (150 words max)
Nine cold-email drafts: a 3-touch sequence (day 0, day 5, day 11) for each ICP segment in targets.csv: 1 = People/Talent (neurodiversity programme owners), 2 = accommodations / Employee Relations, 3 = higher-education faculty development and disability resources. Every email asks for one 20-minute discovery conversation, not a sale. None makes an efficacy claim, uses a statistic, or frames the offer as DEI. Co-design with paid ADHD advisors is stated only as a plan ("which I plan to co-design with...") because no advisor is engaged yet. Merge fields match targets.csv columns (`company`, `public_signal`), plus founder-filled fields. Each email is under 120 words including subject and footer, at worst-case merge-field lengths (counts in Part C). **Nothing here has been sent.** Sending is the human-gated node V09: the founder approves each batch of 10 or fewer, sends from their own account, and honors opt-outs. Legal points are marked [COUNSEL].

---

## Part A. Merge fields

| Field | Source | Rule |
|---|---|---|
| `{{company}}` | targets.csv `company` | Use the clean organisation name. Drop parentheticals such as "(HR / staff accommodations)" |
| `{{public_signal}}` | targets.csv `public_signal` | Rewrite to one noun phrase of 15 words or fewer that reads after "I noticed". Re-check it against `source_url` first. No row is `confidence` high yet (no source page has been read; scale defined in icp.md section 6), so every row must be opened and confirmed before any send; low rows need a primary source first |
| `{{first_name}}` | Founder, by hand | Not a targets.csv column. Only from a public company page or the role title; if none, use "Hello" |
| `{{sender_name}}` | Founder | Real name; sending is from the founder's own account |
| `{{postal_address}}` | Founder | Valid physical postal address; blank until the legal entity exists (M04) |

Do not paste the `notes` column into any message. It is internal.

---

## Part B. Sequences

Cadence: touch 1 on day 0, touch 2 on day 5, touch 3 on day 11. Any reply, including a refusal, ends the sequence. Stop after touch 3. Each block is the full sendable text: subject, body, footer.

### Segment 1: People / Talent (retention and manager effectiveness)

**S1-T1 (day 0)**
```
Subject: After the hire: a 20-minute question

Hi {{first_name}},

I noticed {{public_signal}} at {{company}}. Hiring is one step; the day-to-day working-style conversations with managers are another.

I'm building a browser-based practice module for managers, which I plan to co-design with paid ADHD advisors. Before building further, I'd like to learn how {{company}} prepares managers for these conversations.

Could we talk for 20 minutes? This is research, not a sales call.

{{sender_name}}, Perspective Engine, {{postal_address}}. Reply "stop" to opt out.
```

**S1-T2 (day 5)**
```
Subject: What manager practice would look like

Hi {{first_name}},

A short follow-up. The module lets a manager rehearse a working-style conversation, then commit to one concrete next step. I plan to co-design it with paid ADHD advisors, and it is educational only.

The open question is whether practice helps managers be more effective and helps teams keep good people. I don't know yet, which is why I'd like 20 minutes with someone at {{company}}. If another team owns this, a pointer would help.

{{sender_name}}, Perspective Engine, {{postal_address}}. Reply "stop" to opt out.
```

**S1-T3 (day 11)**
```
Subject: Closing the loop

Hi {{first_name}},

My last note. If a 20-minute conversation about manager practice isn't a priority at {{company}} right now, that's fine.

If someone else owns manager effectiveness or retention, I'd be grateful for a name, or an introduction. Otherwise I won't write again.

Thank you for your time,
{{sender_name}}, Perspective Engine, {{postal_address}}. Reply "stop" to opt out.
```

### Segment 2: Accommodations / Employee Relations ("practice for the accommodation-request conversation"; no compliance-outcome wording)

**S2-T1 (day 0)**
```
Subject: The accommodation-request conversation, from the manager's side

Hi {{first_name}},

I noticed {{public_signal}}, which suggests {{company}} has a real accommodations function.

I'm building a browser-based tool where managers practice the accommodation-request conversation, which I plan to co-design with paid ADHD advisors. It is educational, not legal advice.

Could I have 20 minutes to hear where managers struggle with these requests in practice? This is a research conversation, not a sales call.

{{sender_name}}, Perspective Engine, {{postal_address}}. Reply "stop" to opt out.
```

**S2-T2 (day 5)**
```
Subject: What would your team need to see?

Hi {{first_name}},

Following up briefly. The idea is that a manager practices responding to an accommodation request before a real one arrives. I plan to co-design it with paid ADHD advisors. It is educational only and makes no compliance promise.

In 20 minutes I'd like to ask two things: where do managers stumble first, and what would your HR and Legal colleagues at {{company}} need to see before trying anything like this? I'm not selling anything yet.

{{sender_name}}, Perspective Engine, {{postal_address}}. Reply "stop" to opt out.
```

**S2-T3 (day 11)**
```
Subject: Closing the loop

Hi {{first_name}},

My last note. If now isn't the time for a 20-minute conversation about manager practice at {{company}}, I understand.

If a colleague owns accommodation requests or manager training, I'd appreciate a name, or an introduction. Otherwise I won't write again.

Thank you,
{{sender_name}}, Perspective Engine, {{postal_address}}. Reply "stop" to opt out.
```

### Segment 3: Higher education (faculty development, teaching centres, disability resources; research-partnership variant)

**S3-T1 (day 0)**
```
Subject: Faculty practice conversations: a research question

Hi {{first_name}},

I noticed {{public_signal}} at {{company}}.

I'm developing a short browser-based practice module for accommodation and working-style conversations, which I plan to co-design with paid ADHD advisors. I'm exploring whether it could sit alongside faculty development, and whether a research partnership with a faculty investigator makes sense.

Could we talk for 20 minutes? I'm here to learn, not to sell.

{{sender_name}}, Perspective Engine, {{postal_address}}. Reply "stop" to opt out.
```

**S3-T2 (day 5)**
```
Subject: A possible research partnership

Hi {{first_name}},

Following up. On a call I can share the planned design: a practice session, a comparison group, and a measure fixed in advance, with results reported whatever they show, including a null. I plan to co-design the module with paid ADHD advisors.

Who is the right person at {{company}}: a teaching-centre lead, disability-access staff, or a faculty member who studies this? Twenty minutes would be enough to find out.

{{sender_name}}, Perspective Engine, {{postal_address}}. Reply "stop" to opt out.
```

**S3-T3 (day 11)**
```
Subject: Closing the loop

Hi {{first_name}},

My last note. If a 20-minute conversation about a research partnership isn't a fit for {{company}} right now, no problem.

If a colleague would be a better contact, I'd welcome a name or an introduction. Otherwise I won't write again.

Thank you,
{{sender_name}}, Perspective Engine, {{postal_address}}. Reply "stop" to opt out.
```

---

## Part C. Word counts

Counted by `python3` over each fenced block (subject, body, sign-off and footer). "As written" counts each merge field as one word. "Worst case" expands `{{public_signal}}` to 15 words, `{{company}}` to 4, `{{postal_address}}` to 8 and `{{sender_name}}` to 2. Limit: under 120.

| Email | Day | As written | Worst case |
|---|---|---|---|
| S1-T1 | 0 | 79 | 107 |
| S1-T2 | 5 | 92 | 103 |
| S1-T3 | 11 | 61 | 72 |
| S2-T1 | 0 | 80 | 105 |
| S2-T2 | 5 | 94 | 105 |
| S2-T3 | 11 | 57 | 68 |
| S3-T1 | 0 | 77 | 102 |
| S3-T2 | 5 | 85 | 96 |
| S3-T3 | 11 | 57 | 68 |

---

## Part D. Sending rules

1. **Batches.** The founder reads and approves each batch of 10 or fewer rendered emails before it goes out. A batch is a list of targets.csv rows plus the final text. Follow-up touches are batches too, each approved separately. Log batch id, date and rows.
2. **Sender.** Sent one at a time from the founder's own account. No bulk-mail tool, no alias or spoofed sender, no tracking pixels (privacy point, [COUNSEL]).
3. **Recipients.** Public company-level or role-based business contacts only. Never scrape or buy personal emails. Do not guess addresses.
4. **Opt-outs.** Any "stop", unsubscribe or negative reply goes on a suppression list the same day, with no further contact and no re-adding. Internal standard is same day; the legal deadline is [COUNSEL].
5. **Verify before send.** Check each `public_signal` against `source_url` on the day of sending. Drop or fix low-confidence rows. Do not repeat any vendor-style productivity figures found in `notes`.
6. **Truth checks at send time.** Keep the "which I plan to co-design with paid ADHD advisors" wording until advisors are actually engaged and paid; only then may it change to "being co-designed with". The legal entity (M04) and a real postal address must exist. No efficacy claims, statistics, condition-simulation language, DEI framing, legal-outcome promises, prices or LOIs in outreach. The ask is a 20-minute discovery conversation only.
7. **US first.** Send only US rows until counsel clears the rest. Non-US rows in targets.csv: SAP (Germany), Ubisoft (France), Lloyds and Barclays (UK), Telstra and Westpac (Australia), plus EY, Baker McKenzie and Lenovo (global). [COUNSEL: lawful basis and B2B cold-email rules differ by country; GDPR/UK GDPR/PECR, Australian Spam Act. Not verified here.]
8. **CAN-SPAM, US.** Treat every message as commercial. Accurate sender and subject (no fake "Re:"), a valid postal address, a working opt-out, and honored requests. [COUNSEL: confirm that B2B research outreach is in scope, the opt-out deadline, and the exact footer.]
9. **GDPR/privacy, any EU or UK recipient.** [COUNSEL: legitimate-interest assessment, privacy notice link, data-subject requests, retention of the suppression list.]
10. **Gate.** Sending is node V09 and needs founder clearance. Log each reply and booked call; they feed the H3 kill test in the LOI template.
