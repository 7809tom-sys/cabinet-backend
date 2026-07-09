export default function ReturnPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-foreground mb-2">Return Policy &amp; Warranty</h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: July 2025</p>

      <div className="space-y-8 text-foreground">

        <section>
          <h2 className="text-xl font-semibold mb-3">Overview</h2>
          <p className="text-muted-foreground leading-relaxed">
            Cabinet Dealz acts as a marketplace platform connecting buyers with authorized cabinet distributors and manufacturers.
            All returns, exchanges, and warranty claims are governed by the policies of the manufacturer or distributor
            who fulfilled your order. We facilitate the process on your behalf and will work with you and the vendor to
            resolve any issues.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">General Return Guidelines</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Returns must be initiated within <strong className="text-foreground">30 days</strong> of delivery.</li>
            <li>Items must be in original, uninstalled condition in original packaging.</li>
            <li>Custom-cut, modified, or installed cabinets are non-returnable.</li>
            <li>Return shipping costs are the responsibility of the buyer unless the return is due to a defect or shipping error.</li>
            <li>A restocking fee of up to 25% may apply depending on the vendor's policy.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Damaged or Defective Items</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            If your order arrives damaged or defective:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Note the damage on the freight carrier's delivery receipt before signing.</li>
            <li>Photograph all damaged items and packaging immediately.</li>
            <li>Contact us within <strong className="text-foreground">48 hours</strong> of delivery at{" "}
              <a href="mailto:sales@cabinetdealz.com" className="text-[var(--color-gold)] hover:underline">sales@cabinetdealz.com</a>.
            </li>
            <li>We will coordinate with the vendor to arrange replacement or credit at no cost to you.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Warranty</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            Warranty coverage is provided directly by the manufacturer of your cabinets. Cabinet Dealz passes through
            the full manufacturer warranty to you. Coverage varies by brand:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-semibold text-foreground">Brand</th>
                  <th className="text-left py-2 pr-4 font-semibold text-foreground">Warranty</th>
                  <th className="text-left py-2 font-semibold text-foreground">Coverage</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium text-foreground">Forevermark Cabinetry</td>
                  <td className="py-2 pr-4">Limited Lifetime</td>
                  <td className="py-2">Defects in materials and workmanship for the life of the original installation</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium text-foreground">Clark &amp; Son Cabinets</td>
                  <td className="py-2 pr-4">Limited Lifetime</td>
                  <td className="py-2">Structural defects, finish, and hardware under normal residential use</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4 font-medium text-foreground">Other Vendors</td>
                  <td className="py-2 pr-4">Per vendor policy</td>
                  <td className="py-2">Refer to the documentation included with your order or contact us for details</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-sm mt-3">
            Warranty does not cover damage from improper installation, misuse, normal wear and tear, or acts of nature.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">How to Initiate a Return or Warranty Claim</h2>
          <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
            <li>Email <a href="mailto:sales@cabinetdealz.com" className="text-[var(--color-gold)] hover:underline">sales@cabinetdealz.com</a> with your order number and a description of the issue.</li>
            <li>Include photos of the item(s) and any packaging damage.</li>
            <li>We will contact the vendor on your behalf and provide a return authorization (RA) number if applicable.</li>
            <li>Ship items back only after receiving written authorization — unauthorized returns may be refused.</li>
            <li>Refunds are processed within 5–10 business days after the vendor confirms receipt of the return.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Non-Returnable Items</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Installed or modified cabinets</li>
            <li>Custom-ordered items (non-stock sizes, custom finishes)</li>
            <li>Items returned without a return authorization number</li>
            <li>Items returned more than 30 days after delivery</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            For return or warranty questions, contact us at{" "}
            <a href="mailto:sales@cabinetdealz.com" className="text-[var(--color-gold)] hover:underline">sales@cabinetdealz.com</a>{" "}
            or call <a href="tel:+19418993288" className="text-[var(--color-gold)] hover:underline">(941) 899-3288</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
