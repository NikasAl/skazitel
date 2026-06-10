import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getSettings } from './core/storage/settings';
import type { AppSettings } from './core/types';
import HomeScreen from './screens/HomeScreen';
import ExerciseScreen from './screens/ExerciseScreen';
import ReviewScreen from './screens/ReviewScreen';
import CreativeScreen from './screens/CreativeScreen';
import WritingScreen from './screens/WritingScreen';
import PoemsScreen from './screens/PoemsScreen';
import SettingsScreen from './screens/SettingsScreen';
import LibraryScreen from './screens/LibraryScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import PipelineScreen from './screens/PipelineScreen';

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-parchment">
        <div className="text-dusk/60 text-lg font-serif">Сказитель загружается...</div>
      </div>
    );
  }

  if (settings && !settings.isOnboarded) {
    return <OnboardingScreen />;
  }

  return (
    <div className="min-h-screen bg-parchment">
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/exercise" element={<ExerciseScreen />} />
        <Route path="/review" element={<ReviewScreen />} />
        <Route path="/creative" element={<CreativeScreen />} />
        <Route path="/writing" element={<WritingScreen />} />
        <Route path="/poems" element={<PoemsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/library" element={<LibraryScreen />} />
        <Route path="/pipeline" element={<PipelineScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
