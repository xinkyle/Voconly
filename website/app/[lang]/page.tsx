import Hero from '../components/Hero';
import Features from '../components/Features';
import Pricing from '../components/Pricing';
import FaqSection from '../components/FaqSection';
import Testimonials from '../components/Testimonials';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen pt-16" style={{ background: 'var(--color-bg-primary)' }}>
      <Hero />
      <Features />
      <Testimonials />
      <Pricing />
      <FaqSection />
      <Footer />
    </main>
  );
}