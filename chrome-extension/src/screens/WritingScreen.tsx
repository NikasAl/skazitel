import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getDrafts,
  addPoem,
  updatePoem,
  deletePoem,
} from '../core/storage/repository';
import { getSettings } from '../core/storage/settings';
import { writingEngine, getCurrentStanza } from '../core/exercise/writingEngine';
import type { WritingToolResult } from '../core/exercise/writingEngine';
import type { Poem } from '../core/types';

// ==================== Мини-компоненты ====================

/** Панель результата ИИ — показывает ответ и кнопки действия */
function ResultPanel({
  result,
  onInsert,
  onReplace,
  onClose,
}: {
  result: WritingToolResult;
  onInsert: () => void;
  onReplace: () => void;
  onClose: () => void;
}) {
  // Форматируем markdown-подобный текст (жирное через **)
  const formatted = result.text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');

  const canInsert = ['generate', 'rewrite_stanza', 'continue', 'resize'].includes(result.tool);
  const canReplace = ['rewrite_stanza', 'resize'].includes(result.tool);

  return (
    <div className="card bg-ink/5 border border-ink/10 mt-4">
      <div
        className="text-sm text-ink leading-relaxed prose-sm"
        dangerouslySetInnerHTML={{ __html: formatted }}
      />
      <div className="flex gap-2 mt-3 pt-3 border-t border-ink/10">
        {canInsert && (
          <button onClick={onInsert} className="btn-primary text-xs px-3 py-1.5">
            Вставить
          </button>
        )}
        {canReplace && (
          <button onClick={onReplace} className="btn-secondary text-xs px-3 py-1.5">
            Заменить строфу
          </button>
        )}
        <button onClick={onClose} className="btn-secondary text-xs px-3 py-1.5 ml-auto">
          Закрыть
        </button>
      </div>
    </div>
  );
}

/** Кнопка инструмента */
function ToolButton({
  label,
  icon,
  loading,
  onClick,
  disabled,
  tooltip,
}: {
  label: string;
  icon: string;
  loading?: boolean;
  onClick: () => void;
  disabled?: boolean;
  tooltip?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={tooltip}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
        bg-dusk/5 text-dusk hover:bg-dusk/10 transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        whitespace-nowrap"
    >
      {loading ? (
        <span className="inline-block w-3.5 h-3.5 border-2 border-dusk/30 border-t-dusk rounded-full animate-spin" />
      ) : (
        <span>{icon}</span>
      )}
      {label}
    </button>
  );
}

/** Модальное окно для слова */
function WordModal({
  show,
  onClose,
  onSubmit,
}: {
  show: boolean;
  onClose: () => void;
  onSubmit: (word: string) => void;
}) {
  const [word, setWord] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (show) {
      setWord('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card bg-parchment p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-ink mb-4">Подобрать рифмы</h3>
        <p className="text-sm text-dusk/60 mb-3">
          Введите слово, к которому нужно подобрать рифмы:
        </p>
        <input
          ref={inputRef}
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && word.trim() && onSubmit(word.trim())}
          placeholder="Слово..."
          className="input-field w-full text-sm mb-4"
        />
        <div className="flex gap-2">
          <button
            onClick={() => word.trim() && onSubmit(word.trim())}
            disabled={!word.trim()}
            className="btn-primary flex-1 text-sm disabled:opacity-40"
          >
            Подобрать
          </button>
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== Основной экран ====================

export default function WritingScreen() {
  const navigate = useNavigate();

  // Состояние черновика
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [style, setStyle] = useState('');
  const [content, setContent] = useState('');

  // Загрузка / сохранение
  const [poemId, setPoemId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Список черновиков
  const [drafts, setDrafts] = useState<Poem[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);

  // Инструменты
  const [loadingTool, setLoadingTool] = useState<string | null>(null);
  const [result, setResult] = useState<WritingToolResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRhymeModal, setShowRhymeModal] = useState(false);

  // Ref для textarea контента (нужен для получения selectionStart/End)
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Позиция курсора в content (для определения строфы)
  const [cursorPos, setCursorPos] = useState({ start: 0, end: 0 });

  // Отслеживание изменения контента — пометка unsaved
  useEffect(() => {
    if (poemId) setIsSaved(false);
  }, [title, context, style, content, poemId]);

  // Загрузка черновиков
  const loadDrafts = useCallback(async () => {
    try {
      const list = await getDrafts();
      setDrafts(list);
    } catch (e) {
      console.error('[WritingScreen] ошибка загрузки черновиков:', e);
    }
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // Отслеживаем курсор в textarea
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    const ta = e.target;
    setCursorPos({ start: ta.selectionStart, end: ta.selectionEnd });
  };

  const handleContentSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    setCursorPos({ start: ta.selectionStart, end: ta.selectionEnd });
  };

  // ==================== Сохранение ====================

  const handleSave = async () => {
    if (!content.trim()) return;
    setIsSaving(true);
    try {
      if (poemId) {
        // Обновляем существующий
        await updatePoem(poemId, {
          title: title || 'Без названия',
          content: content,
          context: context || undefined,
          style: style || undefined,
          status: 'draft',
        });
      } else {
        // Создаём новый
        const poem = await addPoem({
          title: title || 'Без названия',
          content: content,
          context: context || undefined,
          style: style || undefined,
          tags: ['writing'],
          isDraft: true,
          status: 'draft',
        });
        setPoemId(poem.id);
      }
      setIsSaved(true);
      await loadDrafts();
    } catch (e) {
      console.error('[WritingScreen] ошибка сохранения:', e);
      setError('Не удалось сохранить');
    } finally {
      setIsSaving(false);
    }
  };

  // Загрузка черновика
  const loadDraft = (draft: Poem) => {
    setPoemId(draft.id);
    setTitle(draft.title || '');
    setContext(draft.context || '');
    setStyle(draft.style || '');
    setContent(draft.content || '');
    setShowDrafts(false);
    setResult(null);
    setError(null);
    setIsSaved(true);
  };

  // Новый черновик
  const handleNew = () => {
    if (!isSaved && poemId && !confirm('Есть несохранённые изменения. Создать новый черновик?')) {
      return;
    }
    setPoemId(null);
    setTitle('');
    setContext('');
    setStyle('');
    setContent('');
    setResult(null);
    setError(null);
    setIsSaved(true);
  };

  // Удаление черновика
  const handleDeleteDraft = async (id: string) => {
    if (!confirm('Удалить этот черновик?')) return;
    await deletePoem(id);
    if (poemId === id) {
      handleNew();
    }
    await loadDrafts();
  };

  // ==================== Инструменты ====================

  const hasApi = async (): Promise<boolean> => {
    const settings = await getSettings();
    if (!settings.apiProvider?.apiKey) {
      setError('Для использования инструментов нужен API-ключ. Настройте его в разделе «Настройки».');
      return false;
    }
    setError(null);
    return true;
  };

  // 1. Создать черновик
  const handleGenerate = async () => {
    if (!(await hasApi())) return;
    if (!context.trim()) {
      setError('Добавьте текст вдохновения (контекст) для генерации.');
      return;
    }
    setLoadingTool('generate');
    setResult(null);
    try {
      const res = await writingEngine.generateDraft(context, style);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setLoadingTool(null);
    }
  };

  // 2. Критик
  const handleCritic = async () => {
    if (!(await hasApi())) return;
    const { stanza } = getCurrentStanza(content, cursorPos.start, cursorPos.end);
    if (!stanza.trim()) {
      setError('Нет текста для анализа. Напишите что-нибудь или поставьте курсор на строфу.');
      return;
    }
    setLoadingTool('critic');
    setResult(null);
    try {
      const res = await writingEngine.criticize(stanza);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка анализа');
    } finally {
      setLoadingTool(null);
    }
  };

  // 3. Рифмы
  const handleRhymes = async (word: string) => {
    setShowRhymeModal(false);
    if (!(await hasApi())) return;
    if (!word) return;

    setLoadingTool('rhymes');
    setResult(null);
    try {
      const { stanza } = getCurrentStanza(content, cursorPos.start, cursorPos.end);
      const res = await writingEngine.findRhymes(word, stanza);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка подбора рифм');
    } finally {
      setLoadingTool(null);
    }
  };

  // 4. Перегенерировать строфу
  const handleRewrite = async () => {
    if (!(await hasApi())) return;
    const { stanza } = getCurrentStanza(content, cursorPos.start, cursorPos.end);
    if (!stanza.trim()) {
      setError('Нет текста для переработки. Поставьте курсор на строфу или выделите её.');
      return;
    }
    setLoadingTool('rewrite_stanza');
    setResult(null);
    try {
      const res = await writingEngine.rewriteStanza(stanza, style, content);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка перегенерации');
    } finally {
      setLoadingTool(null);
    }
  };

  // 5. Продолжить
  const handleContinue = async () => {
    if (!(await hasApi())) return;
    if (!content.trim()) {
      setError('Нет текста для продолжения. Напишите хотя бы одну строфу.');
      return;
    }
    setLoadingTool('continue');
    setResult(null);
    try {
      const res = await writingEngine.continue(content, style);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка продолжения');
    } finally {
      setLoadingTool(null);
    }
  };

  // 6. Сократить / развернуть
  const handleResize = async (action: 'shorter' | 'longer') => {
    if (!(await hasApi())) return;
    const { stanza } = getCurrentStanza(content, cursorPos.start, cursorPos.end);
    if (!stanza.trim()) {
      setError('Нет текста. Поставьте курсор на строфу или выделите фрагмент.');
      return;
    }
    setLoadingTool(`resize_${action}`);
    setResult(null);
    try {
      const res = await writingEngine.resize(stanza, action);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoadingTool(null);
    }
  };

  // ==================== Действия с результатом ====================

  /** Вставить результат в конец текста */
  const handleInsertResult = () => {
    if (!result) return;
    const separator = content.trim() ? '\n\n' : '';
    setContent(prev => prev + separator + result.text);
    setResult(null);
  };

  /** Заменить текущую строфу результатом */
  const handleReplaceStanza = () => {
    if (!result) return;
    const { startIndex, endIndex } = getCurrentStanza(content, cursorPos.start, cursorPos.end);
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex);
    const separator = before.trim() ? '\n\n' : '';
    const afterSeparator = after.trim() ? '\n\n' : '';
    setContent(before + separator + result.text + afterSeparator + after);
    setResult(null);
  };

  // ==================== Render ====================

  return (
    <div className="screen-container pb-24">
      {/* Шапка */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 rounded-full bg-dusk/10 flex items-center justify-center
              hover:bg-dusk/20 transition-colors text-dusk"
          >
            ←
          </button>
          <div>
            <h1 className="text-xl font-bold text-ink">Писательство</h1>
            <p className="text-xs text-dusk/50">рабочий стол поэта</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Индикатор сохранения */}
          <span className={`text-xs ${isSaved ? 'text-sage' : 'text-ember'}`}>
            {isSaved ? 'сохранено' : 'несохранённые'}
          </span>
          {/* Список черновиков */}
          <button
            onClick={() => setShowDrafts(!showDrafts)}
            className="w-10 h-10 rounded-full bg-dusk/10 flex items-center justify-center
              hover:bg-dusk/20 transition-colors text-dusk text-sm"
            title="Мои черновики"
          >
            📑
          </button>
          {/* Новый */}
          <button
            onClick={handleNew}
            className="w-10 h-10 rounded-full bg-dusk/10 flex items-center justify-center
              hover:bg-dusk/20 transition-colors text-dusk text-sm"
            title="Новый черновик"
          >
            ＋
          </button>
        </div>
      </header>

      {/* Список черновиков (выпадающий) */}
      {showDrafts && (
        <div className="card mb-4 p-0 overflow-hidden max-h-64 overflow-y-auto">
          {drafts.length === 0 ? (
            <div className="text-center text-dusk/50 py-6 text-sm">Пока нет черновиков</div>
          ) : (
            drafts.map((d) => (
              <div
                key={d.id}
                onClick={() => loadDraft(d)}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-dusk/5 transition-colors
                  ${poemId === d.id ? 'bg-ember/10 border-l-2 border-ember' : 'border-l-2 border-transparent'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink text-sm truncate">{d.title || 'Без названия'}</div>
                  <div className="text-xs text-dusk/40 truncate">
                    {d.style && `Стиль: ${d.style}`}
                    {d.updatedAt && ` · ${new Date(d.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDraft(d.id);
                  }}
                  className="ml-2 w-7 h-7 rounded-full hover:bg-ember/10 flex items-center
                    justify-center text-dusk/30 hover:text-ember text-xs flex-shrink-0"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Заголовок */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название стихотворения..."
        className="input-field w-full text-lg font-bold mb-4 bg-transparent border-none
          focus:ring-0 placeholder:text-dusk/30 placeholder:font-normal"
      />

      {/* Контекст / Вдохновение */}
      <div className="mb-4">
        <label className="text-xs font-medium text-dusk/60 mb-1 block">Вдохновение (контекст)</label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Текст, который вдохновил, или описание чему посвящены стихи..."
          rows={3}
          className="input-field w-full text-sm resize-none"
        />
      </div>

      {/* Стиль */}
      <div className="mb-6">
        <label className="text-xs font-medium text-dusk/60 mb-1 block">Стиль</label>
        <input
          type="text"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder="Например: в стиле Пушкина, современным языком; или: верлибр, минимализм..."
          className="input-field w-full text-sm"
        />
      </div>

      {/* Основное поле стихов */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-dusk/60">Стихи</label>
          <span className="text-xs text-dusk/40">
            {content.split(/\n+/).filter(l => l.trim()).length} строк
          </span>
        </div>
        <textarea
          ref={contentRef}
          value={content}
          onChange={handleContentChange}
          onSelect={handleContentSelect}
          placeholder="Начните писать здесь..."
          rows={12}
          className="input-field w-full text-sm font-serif leading-relaxed resize-y min-h-[200px]"
        />
      </div>

      {/* Инструменты */}
      <div className="mb-4">
        <label className="text-xs font-medium text-dusk/60 mb-2 block">Инструменты</label>
        <div className="flex flex-wrap gap-1.5">
          <ToolButton
            label="Создать черновик"
            icon="✍️"
            loading={loadingTool === 'generate'}
            onClick={handleGenerate}
            disabled={!context.trim()}
            tooltip="Сгенерировать стихи по контексту и стилю"
          />
          <ToolButton
            label="Критик"
            icon="🔍"
            loading={loadingTool === 'critic'}
            onClick={handleCritic}
            disabled={!content.trim()}
            tooltip="Анализ текущей строфы"
          />
          <ToolButton
            label="Рифмы"
            icon="🔗"
            loading={loadingTool === 'rhymes'}
            onClick={() => setShowRhymeModal(true)}
            tooltip="Подобрать рифмы к слову"
          />
          <ToolButton
            label="Перегенерировать"
            icon="🔄"
            loading={loadingTool === 'rewrite_stanza'}
            onClick={handleRewrite}
            disabled={!content.trim()}
            tooltip="Переписать текущую строфу в заданном стиле"
          />
          <ToolButton
            label="Продолжить"
            icon="💡"
            loading={loadingTool === 'continue'}
            onClick={handleContinue}
            disabled={!content.trim()}
            tooltip="Дописать следующую строфу"
          />
          <ToolButton
            label="Сократить"
            icon="✂️"
            loading={loadingTool === 'resize_shorter'}
            onClick={() => handleResize('shorter')}
            disabled={!content.trim()}
            tooltip="Сократить текущую строфу"
          />
          <ToolButton
            label="Развернуть"
            icon="📝"
            loading={loadingTool === 'resize_longer'}
            onClick={() => handleResize('longer')}
            disabled={!content.trim()}
            tooltip="Развёрнуть текущую строфу"
          />
        </div>
      </div>

      {/* Ошибка */}
      {error && (
        <div className="card bg-ember/10 border border-ember/20 mb-4">
          <div className="text-sm text-ember">{error}</div>
          <button
            onClick={() => setError(null)}
            className="text-xs text-ember/60 mt-1 hover:text-ember"
          >
            Скрыть
          </button>
        </div>
      )}

      {/* Результат ИИ */}
      {result && (
        <ResultPanel
          result={result}
          onInsert={handleInsertResult}
          onReplace={handleReplaceStanza}
          onClose={() => setResult(null)}
        />
      )}

      {/* Модальное окно рифм */}
      <WordModal
        show={showRhymeModal}
        onClose={() => setShowRhymeModal(false)}
        onSubmit={handleRhymes}
      />

      {/* Нижняя панель — Сохранить */}
      <div className="fixed bottom-0 left-0 right-0 bg-parchment/95 backdrop-blur border-t border-dusk/10 p-3 z-40">
        <div className="max-w-lg mx-auto flex gap-3">
          <button
            onClick={handleSave}
            disabled={!content.trim() || isSaving}
            className="btn-primary flex-1 text-sm disabled:opacity-40"
          >
            {isSaving ? 'Сохранение...' : isSaved && poemId ? 'Сохранено ✓' : 'Сохранить'}
          </button>
          <button
            onClick={() => navigate('/')}
            className="btn-secondary px-6 text-sm"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
