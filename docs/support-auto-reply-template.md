# Auto-reply template — support@micropulse.is

Ready-to-paste inn í Gmail. Notað sem "canned response" / "template" á filter sem matchar `to:support@micropulse.is`.

---

## Subject line

```
We got your message — svar á leiðinni
```

---

## Body (bilingual, English first, Icelandic below)

```
Hi there,

Thanks for reaching out to MicroPulse support. This is an automated confirmation that your message has been received.

• We respond within 1 business day (Mon–Fri, 09:00–17:00 GMT).
• For urgent outages or issues blocking a training session, reply to this email with "URGENT" in the subject — we'll prioritize it.
• If the system is down, check status updates at [status page URL or skip this line for now].

No need to reply to this message — we'll be in touch shortly.

— The MicroPulse team


———

Sæl(l),

Takk fyrir að hafa samband við MicroPulse support. Þetta er sjálfvirkt svar sem staðfestir að skilaboðin hafi borist okkur.

• Við svörum innan 1 virks dags (mán–fös, 09:00–17:00 GMT).
• Ef um bráðavandamál er að ræða — t.d. kerfið virkar ekki rétt fyrir æfingu sem er að hefjast — svaraðu þessum pósti með "BRÁÐA" í subject-inu. Við forgangsröðum þeim málum.
• Ef kerfið er niðri færðu uppfærslur á [status page URL eða slepptu þessari línu].

Þú þarft ekki að svara þessum pósti — við höfum samband við þig fljótlega.

— MicroPulse teymið
```

---

## Gmail filter setup (einu sinni)

Eftir að Gmail "Send mail as" er búið að staðfesta `support@micropulse.is`:

1. Gmail → Settings (⚙️) → **See all settings** → **Filters and Blocked Addresses** → **Create a new filter**
2. Skilyrði (Criteria):
   - **To:** `support@micropulse.is`
3. **Create filter** → merkja:
   - ☑ Apply the label: `Support` *(búa til ef ekki til)*
   - ☑ Star it
   - ☑ Send canned response: *(velja template-ið sem þú bjóst til með body-inu hér að ofan)*
   - ☑ Never send it to Spam
4. **Create filter**

## Canned response setup (einu sinni)

Canned responses þarf að kveikja á fyrst:

1. Settings → **Advanced** flipinn → **Templates: Enable** → Save Changes
2. Í nýjum pósti: pasta subject + body hér að ofan inn.
3. Þegar tilbúið: þrípunktur (⋮) neðst → **Templates** → **Save draft as template** → **Save as new template** → nefna t.d. `MicroPulse support auto-reply`.
4. Núna getur filter-inn ofan sent þennan template sjálfkrafa.

---

## TODO áður en farið er live

- [ ] Bæta við raunverulegu status page URL (eða fjarlægja þá línu úr body)
- [ ] Ákveða endanlegan "urgent keyword": `URGENT` / `BRÁÐA` / annað
- [ ] Prófa filter-inn með því að senda tölvupóst frá öðrum account á `support@micropulse.is`
