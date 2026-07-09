export default function ShippingPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-foreground mb-2">Shipping Policy</h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: July 2025</p>

      <div className="prose prose-neutral max-w-none space-y-8 text-foreground">

        <section>
          <h2 className="text-xl font-semibold mb-3">Overview</h2>
          <p className="text-muted-foreground leading-relaxed">
            Cabinet Dealz ships cabinet orders nationwide across the contiguous United States. All orders are fulfilled
            directly by our network of authorized distributors. Shipping costs, transit times, and carrier selection
            depend on the distributor fulfilling your order and your delivery location.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Shipping Rates</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            Shipping costs are calculated based on the size and weight of your order, your delivery zip code, and the
            fulfilling distributor's warehouse location. Live shipping quotes are provided at checkout before payment is collected.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Kitchen cabinet orders: minimum shipping cost of $800 (freight/LTL delivery)</li>
            <li>Smaller accessory or single-item orders may ship via UPS/FedEx ground at lower rates</li>
            <li>Free shipping promotions, when available, will be displayed at checkout</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Delivery Method</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            Full kitchen cabinet orders are shipped via freight (LTL — Less Than Truckload). Freight delivery includes:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li><strong className="text-foreground">Curbside delivery</strong> — the carrier delivers to your curb or driveway. You are responsible for moving items inside.</li>
            <li>You will receive a call from the freight carrier to schedule a delivery appointment.</li>
            <li>Someone must be present to receive and inspect the delivery.</li>
            <li>White-glove or inside delivery may be available for an additional fee — contact us for a quote.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Processing Time</h2>
          <p className="text-muted-foreground leading-relaxed">
            Orders are typically processed within 1–3 business days after payment confirmation. Once your order ships,
            you will receive a tracking number via email. Transit time is typically 5–10 business days depending on your
            location and the fulfilling distributor.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Inspecting Your Delivery</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            <strong className="text-foreground">Inspect all items before signing the delivery receipt.</strong> If you notice
            damage, note it on the delivery receipt before the driver leaves. Failure to note damage at delivery may affect
            your ability to file a damage claim.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>Take photos of any damaged packaging or items immediately upon delivery.</li>
            <li>Report damage to us within 48 hours of delivery at <a href="mailto:sales@cabinetdealz.com" className="text-[var(--color-gold)] hover:underline">sales@cabinetdealz.com</a>.</li>
            <li>Do not refuse delivery unless the entire shipment is visibly destroyed — partial damage is handled through our claims process.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Shipping Restrictions</h2>
          <p className="text-muted-foreground leading-relaxed">
            We currently ship to the 48 contiguous United States only. We do not ship to Alaska, Hawaii, Puerto Rico,
            or international destinations at this time.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            For shipping questions, contact us at{" "}
            <a href="mailto:sales@cabinetdealz.com" className="text-[var(--color-gold)] hover:underline">sales@cabinetdealz.com</a>{" "}
            or call <a href="tel:+19418993288" className="text-[var(--color-gold)] hover:underline">(941) 899-3288</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
