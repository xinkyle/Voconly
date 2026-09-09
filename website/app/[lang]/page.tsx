import Hero from '../components/Hero';
import DictationGrid from '../components/DictationGrid';
import ShortcutShowcase from '../components/ShortcutShowcase';
import TechCapabilities from '../components/TechCapabilities';
import Pricing from '../components/Pricing';
import FaqSection from '../components/FaqSection';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen pt-16" style={{ background: 'var(--color-bg-primary)' }}>
      <Hero />
      <DictationGrid />
      <ShortcutShowcase />
      <TechCapabilities />
      <Pricing />
      <FaqSection />
      <Footer />
    </main>
  );
}