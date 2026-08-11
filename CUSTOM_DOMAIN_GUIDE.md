# Custom Domain Setup Guide for Affiliates

## Overview
Affiliates can point their own custom domain (e.g., reaveswaycabinets.com) to their Cabinet Dealz storefront instead of using the default reaves-way-cabinet-shop.cabinetdealz.com subdomain.

## Step-by-Step Setup

### Step 1: Prepare Your Domain
- You must own or have admin access to the domain you want to use
- The domain should be registered with a domain registrar (GoDaddy, Namecheap, etc.)
- You'll need to modify the domain's DNS records

### Step 2: Get Your Target Address
- Your storefront's default address: `https://reaves-way-cabinet-shop.cabinetdealz.com`
- You'll point your custom domain to this address using DNS records

### Step 3: Update DNS Records
Go to your domain registrar's DNS management panel and add/update these records:

**Option A: Using CNAME (Recommended)**
- Type: CNAME
- Name: @ (or your domain name)
- Value: reaves-way-cabinet-shop.cabinetdealz.com
- TTL: 3600 (or default)

**Option B: Using A Record (if CNAME not available)**
- Type: A
- Name: @
- Value: 76.76.19.165 (Cabinet Dealz server IP)
- TTL: 3600

### Step 4: Wait for DNS Propagation
- DNS changes can take 24-48 hours to fully propagate
- Check propagation at: https://dnschecker.org
- Once propagated, your custom domain will point to your storefront

### Step 5: Test Your Domain
- Visit your custom domain in a browser
- You should see your storefront (not the main Cabinet Dealz site)
- Check that your logo, colors, and branding appear correctly

## Troubleshooting

**Issue: Custom domain shows main Cabinet Dealz site**
- Wait 24-48 hours for DNS propagation
- Check your DNS records are correct
- Clear your browser cache (Ctrl+Shift+Delete)

**Issue: Domain shows "Connection refused" or "Not found"**
- Verify the CNAME or A record value is correct
- Check that your domain registrar saved the changes
- Try a different DNS record type (CNAME vs A)

**Issue: SSL certificate warning**
- Cabinet Dealz handles SSL automatically
- If you see a warning, wait a few hours and refresh
- The certificate should provision automatically

## Support
If you need help setting up your custom domain, contact your account manager or email support@cabinetdealz.com with:
- Your custom domain name
- Your storefront slug (e.g., reaves-way-cabinet-shop)
- Screenshots of your DNS records
