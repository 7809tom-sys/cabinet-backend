# Hostinger SMTP reference

Source: [Hostinger — How to get email account configuration details](https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/) (retrieved 2026-09-27).

For Hostinger Email outbound SMTP:

| Field | Value |
|---|---|
| SMTP host | `smtp.hostinger.com` |
| Default encryption | SSL |
| Default port | `465` |
| Fallback encryption | TLS or STARTTLS |
| Fallback port | `587` |
| Username | Full Hostinger mailbox address |
| Password | Mailbox password |

Hostinger documents that the account’s connection settings are available in hPanel under **Emails → Manage → Connect Apps & Devices**. The mailbox must exist and the domain requires correct Hostinger Email DNS/MX configuration.

CabinetDealz uses this only as a user-applied client-side preset. Credentials are entered only through the protected Admin Email Settings form and are encrypted at rest.
