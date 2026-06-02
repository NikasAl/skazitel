import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { db } from '../core/storage/db';
import type { Poem } from '../core/types';

export default function PoemsScreen() {
  const navigate = useNavigate();
  const [poems, setPoems] = useState<Poem[]>([]);

  useEffect(() => {
    db.poems.orderBy('createdAt').reverse().toArray().then(setPoems);
  }, []);

  return (
    <div className="screen-container">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-full bg-dusk/10 flex items-center justify-center
            hover:bg-dusk/20 transition-colors text-dusk"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-ink">Мои стихи</h1>
      </header>

      {poems.length === 0 ? (
        <div className="card text-center text-dusk/50 py-12">
          <div className="text-4xl mb-4">📝</div>
          <p>Здесь будут стихи, которые ты напишешь</p>
          <p className="text-sm mt-2">Выполняй упражнения, чтобы сохранять свои работы</p>
        </div>
      ) : (
        <div className="space-y-4">
          {poems.map((poem) => (
            <div key={poem.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-ink">{poem.title || 'Без названия'}</h3>
                {poem.isDraft && <div className="badge">черновик</div>}
              </div>
              <div className="whitespace-pre-wrap text-dusk/70 font-serif leading-relaxed">
                {poem.content.length > 200
                  ? poem.content.substring(0, 200) + '...'
                  : poem.content}
              </div>
              <div className="text-xs text-dusk/40 mt-3">
                {new Date(poem.createdAt).toLocaleDateString('ru-RU')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
