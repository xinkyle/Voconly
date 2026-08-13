import Hero from '../components/Hero';
import Features from '../components/Features';
import Pricing from '../components/Pricing';
import FaqSection from '../components/FaqSection';
import Testimonials from '../components/Testimonials';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      <Hero />
      <Features />
      <Pricing />
      <FaqSection />
      <Testimonials />
      <Footer />
    </main>
  );
}