# Cabinet Dealz Affiliate White-Label & Subdomain Setup Guide
**Author:** Cabinet Dealz Master Admin / Manus AI  
**Example Affiliate:** First Class Flooring (`first-class-flooring.cabinetdealz.com`)

---

## Executive Overview

The Cabinet Dealz platform operates on a multi-tier Parent/Child architecture that empowers partners (affiliates) to launch fully white-labeled, branded storefronts under their own subdomains (e.g., `first-class-flooring.cabinetdealz.com`). This comprehensive guide details the precise three-step procedure required to provision, configure, and launch a new affiliate partner from scratch, using **First Class Flooring** as our primary reference implementation.

By adhering to this white-label framework, master administrators maintain centralized control over product catalogs, global pricing rules, and top-down telemetry, while affiliate partners enjoy isolated CRM pipelines, dedicated team management (salespeople and designers), and an unbranded checkout experience.

---

## The Three-Step Affiliate Onboarding Workflow

The complete deployment of a new affiliate storefront encompasses three distinct operational domains: the Master Admin Panel, the Domain Registrar (Hostinger), and the Manus Platform Settings.

| Step | Component | Action Required | Responsibility |
| :--- | :--- | :--- | :--- |
| **Step 1** | Master Admin Panel | Create affiliate profile, auto-generate business slug, configure brand asset overrides | Master Admin |
| **Step 2** | Domain Registrar (Hostinger) | Configure DNS CNAME record pointing subdomain to the main platform infrastructure | Affiliate / IT Admin |
| **Step 3** | Manus Platform Settings | Bind custom subdomain in the platform settings and verify SSL/routing | Master Admin |

---

## Step 1: Provisioning the Affiliate in the Master Admin Panel

The first phase in establishing a white-label affiliate is registering their entity within the Master Admin dashboard. This action initializes their database records, auto-generates their unique URL slug, and configures their initial branding parameters.

### 1.1 Accessing the Affiliates Administration Interface
Log into the Cabinet Dealz platform using a Master Admin account. In the top-right navigation bar, click on the **Admin Panel** link, then navigate to the **Affiliates** tab.

### 1.2 Creating a New Affiliate Partner
Click the **"Add Affiliate"** button to open the provisioning modal. Complete the required fields with the partner's legal business name and contact information:

* **Business Name:** `First Class Flooring`
* **Contact Name:** John Doe
* **Email Address:** `support@firstclassflooring.com`
* **Phone Number:** (555) 019-2834

### 1.3 Automatic Slug Generation & Subdomain Mapping
Upon submission, the system automatically processes the business name through its slugification engine (`slugify()`), stripping special characters and converting whitespace into hyphens. For **First Class Flooring**, the system generates the exact subdomain slug:

$$\text{Slug: } \texttt{first-class-flooring}$$

This slug immediately establishes their dedicated subdomain endpoint:

$$\text{Storefront URL: } \texttt{https://first-class-flooring.cabinetdealz.com}$$

### 1.4 Configuring White-Label Brand Overrides
Within the affiliate edit panel, configure the partner's unique brand presentation to ensure zero Cabinet Dealz branding bleed:
* **Custom Store Name:** `First Class Flooring Design Center`
* **Logo URL:** Upload or provide the affiliate's high-resolution vector logo.
* **Style Name Overrides:** Map master catalog families to the affiliate's proprietary marketing names (e.g., mapping master style *Aston Green* to affiliate style *Emerald Haven*).

---

## Step 2: Configuring DNS CNAME Records in Hostinger

Once the affiliate profile and subdomain slug are provisioned in the Master Admin panel, the corresponding DNS routing must be established at the domain registrar. In this guide, we utilize **Hostinger** as the DNS management provider for `cabinetdealz.com`.

### 2.1 Navigating to DNS Zone Editor
1. Log into your **Hostinger HPanel** account.
2. Navigate to the **Domains** menu and select `cabinetdealz.com`.
3. Locate and click on the **DNS / Nameservers** management section to open the DNS Zone Editor.

### 2.2 Creating the CNAME Record
Add a new CNAME (Canonical Name) record to route incoming traffic from the affiliate's subdomain to the core application server. Enter the following parameters precisely:

* **Type:** `CNAME`
* **Name / Host:** `first-class-flooring` *(Note: Do not include `.cabinetdealz.com`, as Hostinger appends the root domain automatically)*
* **Points to / Target:** `cabinetz-dq7pucbp.manus.space` *(or your primary application deployment domain)*
* **TTL (Time to Live):** `14400` (or Default / 3600 seconds)

### 2.3 Verification of DNS Propagation
After saving the CNAME record in Hostinger, DNS propagation typically completes within minutes globally. You can verify proper propagation by running a standard DNS lookup command in your terminal:

```bash
dig CNAME first-class-flooring.cabinetdealz.com +short
```

The output should successfully resolve to the primary Manus hosting target (`cabinetz-dq7pucbp.manus.space`).

---

## Step 3: Binding the Domain in Manus Platform Settings

The final operational phase links the newly propagated subdomain directly to the routing middleware inside the Manus platform management interface.

### 3.1 Accessing Platform Settings → Domains
1. Open the Manus Management UI from your active session.
2. Navigate to **Settings** in the side navigation panel.
3. Select the **Domains** sub-panel.

### 3.2 Adding and Verifying the Custom Domain
1. In the custom domains input field, enter the affiliate's complete subdomain:
   $$\texttt{first-class-flooring.cabinetdealz.com}$$
2. Click **"Add Domain"**.
3. The platform will automatically perform an SSL handshake and bind the domain to the Express server middleware (`server/_core/index.ts`).

### 3.3 Testing the End-to-End White-Label Flow
Open a fresh incognito browser session and navigate directly to `https://first-class-flooring.cabinetdealz.com`. Verify the following architectural invariants:
1. **Subdomain Detection:** The server-side routing middleware detects the `first-class-flooring` prefix and serves the branded storefront without manual path redirects.
2. **Branding Isolation:** The header displays the First Class Flooring logo and custom store name. Cabinet Dealz branding is completely absent.
3. **Product Catalog Sync:** Master catalog items, pricing structures, and high-resolution images (`catalogImageUrl`) load seamlessly from the centralized master repository.
4. **Checkout Integrity:** Adding items to the cart and proceeding to checkout maintains the affiliate's branded header, ensuring a seamless customer experience.

---

## Master Admin vs. Affiliate Portal Permissions Matrix

To maintain operational clarity and data security, the platform enforces strict One-Way Directional Visibility and Role-Based Access Control (RBAC):

| Feature / Data Domain | Cabinet Dealz Master Admin | Affiliate Partner Portal | Affiliate Sales / Designer |
| :--- | :--- | :--- | :--- |
| **Master CRM & Wholesale Leads** | Full Access (Read/Write) | **ZERO Access** (Invisible) | **ZERO Access** (Invisible) |
| **Affiliate CRM Leads & Deals** | Full Read & Management View | Assigned Leads Only | Assigned Leads Only |
| **"Needs Help Closing" Escalations** | Full Oversight & Red Badge Alerts | Can Flag Deals for Review | Can Flag Deals for Review |
| **Team & Staff Management** | Full Oversight across Network | Can Add/Manage Local Staff | **ZERO Access** |
| **Product Catalog & Pricing** | Full Master Catalog Control | Markup & Custom Naming Only | View Catalog Pricing Only |

---

## Summary and Next Steps

By executing this three-step protocol—provisioning the slug in the Master Admin panel, creating the CNAME record in Hostinger, and binding the domain in Manus Settings—affiliate partners like **First Class Flooring** receive an enterprise-grade, fully white-labeled digital storefront within minutes. 

Master administrators can immediately monitor affiliate telemetry, review escalated CRM deals via the "Needs Help Closing" indicator, and empower affiliate sales teams to close transactions under their own brand banner.
