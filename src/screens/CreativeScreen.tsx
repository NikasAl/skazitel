import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function CreativeScreen() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [showAiReview, setShowAiReview] = useState(false);

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
        <h1 className="text-xl font-bold text-ink">Творческая сессия</h1>
      </header>

      <div className="card bg-gradient-to-br from-sage/5 to-dusk/5 mb-6 text-center">
        <div className="text-3xl mb-2"> feather</div>
        <p className="text-dusk/70 italic">
          Просто напиши что чувствуешь. Нет ограничений, нет оценки, нет XP.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Пиши свободно..."
        className="input-field min-h-[300px] font-serif text-lg leading-relaxed resize-y mb-4"
        autoFocus
      />

      <div className="flex justify-between text-sm text-dusk/40 mb-6">
        <span>{text.split('\n').filter(Boolean).length} строк</span>
        <span>{text.split(/\s+/).filter(Boolean).length} слов</span>
      </div>

      {text.trim() && (
        <div className="space-y-3">
          <button
            className="btn-secondary w-full"
            onClick={() => setShowAiReview(!showAiReview)}
          >
            {showAiReview ? 'Скрыть разбор ИИ' : 'Попросить ИИ разобрать текст'}
          </button>

          {showAiReview && (
            <div className="card bg-dusk/5 text-center text-dusk/50 py-8">
              Разбор текста ИИ будет доступен после подключения API.
            </div>
          )}

          <button className="btn-primary w-full" onClick={() => navigate('/')}>
            Завершить сессию (+15 XP)
          </button>
        </div>
      )}
    </div>
  );
}
