import React from "react";
import { Link } from "wouter";

const APP_STORE_URL = "https://apps.apple.com/app/cabinetdealz/id000000000"; // placeholder until published
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.cabinetdealz.app"; // placeholder
const EXPO_GO_URL = "https://expo.dev/go"; // for testing now

const FEATURES = [
  {
    icon: "📐",
    title: "2D Kitchen Designer",
    desc: "Plan your full kitchen layout on your phone. Place cabinets, appliances, windows, and doors — then send your design directly to our team.",
  },
  {
    icon: "📏",
    title: "AR Tape Measure",
    desc: "Use your phone camera to measure walls, windows, and spaces with augmented reality. No physical tape measure needed.",
  },
  {
    icon: "🗂️",
    title: "Full Cabinet Catalog",
    desc: "Browse thousands of cabinet styles, countertops, fixtures, and more — all at trade pricing, right from your pocket.",
  },
  {
    icon: "💾",
    title: "Save & Share Designs",
    desc: "Save your kitchen designs, share them with clients, and submit orders directly from the app.",
  },
  {
    icon: "🔔",
    title: "Order Tracking",
    desc: "Get real-time notifications on your order status, shipping updates, and delivery confirmations.",
  },
  {
    icon: "🔐",
    title: "Trade Account Access",
    desc: "Log in to your trade account for exclusive contractor pricing, saved projects, and CRM integration.",
  },
];

export default function MobileApp() {
  return (
    <div className="min-h-screen bg-[#0f1929] text-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1a2744] to-[#0f1929] pt-20 pb-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left: Text */}
            <div>
              <div className="inline-flex items-center gap-2 bg-[#d4a75a]/10 border border-[#d4a75a]/30 rounded-full px-4 py-2 text-[#d4a75a] text-sm font-semibold mb-6">
                <span>📱</span> Now Available on iOS & Android
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4">
                Design Kitchens{" "}
                <span className="text-[#d4a75a]">From Your Phone</span>
              </h1>
              <p className="text-[#8a9bb8] text-lg leading-relaxed mb-8">
                The CabinetDealz app puts the full power of our trade platform
                in your pocket — 2D kitchen designer, AR tape measure, full
                catalog, and trade pricing all in one place.
              </p>

              {/* Download Badges */}
              <div className="flex flex-wrap gap-4 mb-6">
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-transform hover:scale-105"
                >
                  <img
                    src="/manus-storage/appstore-badge_7289e8ca.png"
                    alt="Download on the App Store"
                    className="h-14 w-auto"
                  />
                </a>
                <a
                  href={GOOGLE_PLAY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-transform hover:scale-105"
                >
                  <img
                    src="/manus-storage/googleplay-badge_4496502d.png"
                    alt="Get it on Google Play"
                    className="h-14 w-auto"
                  />
                </a>
              </div>

              <p className="text-[#6a7a9a] text-sm">
                Available for iPhone, iPad, and Android devices.
              </p>
            </div>

            {/* Right: Phone mockup / QR */}
            <div className="flex flex-col items-center gap-6">
              {/* App icon */}
              <div className="w-24 h-24 rounded-3xl bg-[#1a2744] border-2 border-[#d4a75a]/30 flex items-center justify-center shadow-2xl">
                <div className="w-16 h-16 rounded-2xl bg-[#d4a75a] flex items-center justify-center">
                  <span className="text-2xl font-extrabold text-[#1a2744]">CD</span>
                </div>
              </div>

              {/* QR Code card */}
              <div className="bg-[#1e2e4a] border border-[#2a3a5c] rounded-2xl p-6 text-center max-w-xs w-full">
                <p className="text-sm font-semibold text-[#d4a75a] mb-3">
                  Test Now with Expo Go
                </p>
                <div className="bg-white rounded-xl p-3 inline-block mb-3">
                  <img
                    src="/manus-storage/app-qr-code_69958964.png"
                    alt="Scan to open in Expo Go"
                    className="w-36 h-36"
                  />
                </div>
                <p className="text-xs text-[#8a9bb8] leading-relaxed">
                  Install{" "}
                  <a
                    href={EXPO_GO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#d4a75a] underline"
                  >
                    Expo Go
                  </a>{" "}
                  on your phone, then scan this QR code to preview the app
                  instantly — no App Store required.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-4 bg-[#0f1929]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-2">
            Everything You Need, On the Go
          </h2>
          <p className="text-[#8a9bb8] text-center mb-12">
            All the tools of the CabinetDealz trade platform — now in your
            pocket.
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-[#1e2e4a] border border-[#2a3a5c] rounded-2xl p-6 hover:border-[#d4a75a]/40 transition-colors"
              >
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-[#8a9bb8] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How to get it */}
      <section className="py-16 px-4 bg-[#1a2744]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8">How to Get the App</h2>
          <div className="grid sm:grid-cols-3 gap-6 text-left mb-10">
            {[
              {
                step: "1",
                title: "Download Expo Go",
                desc: 'Search "Expo Go" in the App Store or Google Play and install it — it\'s free.',
              },
              {
                step: "2",
                title: "Scan the QR Code",
                desc: "Open Expo Go, tap Scan QR Code, and scan the code above to launch the CabinetDealz app instantly.",
              },
              {
                step: "3",
                title: "Start Designing",
                desc: "Log in with your CabinetDealz account and start designing kitchens, measuring rooms, and browsing cabinets.",
              },
            ].map((s) => (
              <div key={s.step} className="bg-[#0f1929] rounded-2xl p-6 border border-[#2a3a5c]">
                <div className="w-10 h-10 rounded-full bg-[#d4a75a] text-[#1a2744] font-extrabold text-lg flex items-center justify-center mb-4">
                  {s.step}
                </div>
                <h3 className="font-bold text-white mb-2">{s.title}</h3>
                <p className="text-sm text-[#8a9bb8] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-[#6a7a9a] text-sm">
            The full native app will be available on the App Store and Google
            Play soon. In the meantime, Expo Go gives you the complete
            experience.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-[#0f1929] text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Design Your Kitchen?
          </h2>
          <p className="text-[#8a9bb8] mb-8">
            Join thousands of contractors and homeowners using CabinetDealz to
            plan and order their dream kitchens.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/design">
              <button className="bg-[#d4a75a] text-[#1a2744] font-bold px-8 py-3 rounded-xl hover:bg-[#e0b86a] transition-colors">
                Try the Web Designer →
              </button>
            </Link>
            <Link href="/catalog">
              <button className="bg-[#1e2e4a] border border-[#2a3a5c] text-white font-semibold px-8 py-3 rounded-xl hover:border-[#d4a75a]/50 transition-colors">
                Browse Catalog
              </button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
