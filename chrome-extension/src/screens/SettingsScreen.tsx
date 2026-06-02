import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { getSettings, saveSettings } from '../core/storage/settings';
import { exportAllData, importData } from '../core/storage/repository';
import { llmRouter } from '../llm/router';
import type { AppSettings, ApiProviderConfig, ExportBundle } from '../core/types';

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: 'OpenRouter',
  'z-ai': 'z-ai',
  gigachat: 'GigaChat',
};

export default function SettingsScreen() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<'success' | 'error' | null>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      if (s.apiProvider) {
        setApiKey(s.apiProvider.apiKey);
        setSelectedModel(s.apiProvider.model);
      }
    });
  }, []);

  const handleValidate = async () => {
    if (!apiKey.trim() || !selectedModel) {
      setValidationResult('error');
      setValidationMessage('Введите API-ключ и выберите модель');
      return;
    }
    setValidating(true);
    setValidationResult(null);
    setValidationMessage('');

    try {
      const providerId = selectedModel.split('/')[0];
      const isValid = await llmRouter.validateApiKey(providerId, apiKey, selectedModel);
      if (isValid) {
        setValidationResult('success');
        setValidationMessage('Ключ принят!');
      } else {
        setValidationResult('error');
        setValidationMessage('Неверный ключ или ошибка доступа');
      }
    } catch (err) {
      setValidationResult('error');
      setValidationMessage(err instanceof Error ? err.message : 'Ошибка проверки');
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);

    const apiProvider: ApiProviderConfig | null = selectedModel
      ? {
          provider: selectedModel.split('/')[0] as ApiProviderConfig['provider'],
          apiKey,
          model: selectedModel,
        }
      : null;

    const newSettings: AppSettings = {
      ...settings,
      apiProvider,
    };

    await saveSettings(newSettings);
    setSaving(false);
    navigate('/');
  };

  const handleExport = async () => {
    const bundle = await exportAllData();

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skazitel-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportResult(null);

    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as ExportBundle;

      // Проверяем минимальную структуру бэкапа
      if (!bundle.version) {
        setImportResult({ imported: 0, errors: ['Файл не является бэкапом Сказителя (отсутствует поле version)'] });
        return;
      }

      const result = await importData(bundle);
      setImportResult(result);
    } catch (err) {
      setImportResult({ imported: 0, errors: [`Ошибка чтения файла: ${err instanceof Error ? err.message : String(err)}`] });
    }

    // Сбрасываем input, чтобы можно было выбрать тот же файл повторно
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Получаем модели из роутера и группируем по провайдерам
  const allModels = llmRouter.getAllModels();
  const groupedModels = allModels.reduce(
    (acc, model) => {
      const p = model.id.split('/')[0];
      if (!acc[p]) acc[p] = [];
      acc[p].push(model);
      return acc;
    },
    {} as Record<string, typeof allModels>,
  );

  if (!settings) return null;

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
        <h1 className="text-xl font-bold text-ink">Настройки</h1>
      </header>

      <div className="space-y-6">
        {/* API-провайдер */}
        <section className="card">
          <h2 className="section-title text-lg mb-4">API-подключение</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dusk/70 mb-1">
                API-ключ
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-... или другой ключ"
                  className="input-field pr-10"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dusk/40
                    hover:text-dusk/70 transition-colors"
                >
                  {showKey ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dusk/70 mb-1">
                Модель
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="input-field appearance-none cursor-pointer"
              >
                <option value="">-- Выберите модель --</option>
                {Object.entries(groupedModels).map(([provider, models]) => (
                  <optgroup key={provider} label={`── ${PROVIDER_LABELS[provider]} ──`}>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {/* Валидация ключа */}
            <div className="flex items-center gap-3">
              <button
                className="btn-secondary flex-shrink-0"
                onClick={handleValidate}
                disabled={validating || !apiKey.trim() || !selectedModel}
              >
                {validating ? 'Проверяем...' : 'Проверить ключ'}
              </button>
              {validationResult && (
                <span className={`text-sm ${validationResult === 'success' ? 'text-sage' : 'text-ember'}`}>
                  {validationMessage}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Прочие настройки */}
        <section className="card">
          <h2 className="section-title text-lg mb-4">Общие</h2>
          <div>
            <label className="block text-sm font-medium text-dusk/70 mb-1">
              Ежедневная цель (XP)
            </label>
            <div className="flex gap-2">
              {[
                { value: 10, label: 'Лёгкая' },
                { value: 20, label: 'Средняя' },
                { value: 50, label: 'Амбициозная' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    setSettings({ ...settings, dailyGoal: opt.value })
                  }
                  className={`flex-1 py-2 rounded-lg text-sm transition-all ${
                    settings.dailyGoal === opt.value
                      ? 'bg-ember text-white'
                      : 'bg-dusk/10 text-dusk/70 hover:bg-dusk/20'
                  }`}
                >
                  {opt.label}
                  <span className="block text-xs mt-0.5 opacity-70">{opt.value} XP</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Данные */}
        <section className="card">
          <h2 className="section-title text-lg mb-4">Данные</h2>
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={handleExport}>
                Экспорт
              </button>
              <button className="btn-secondary flex-1" onClick={handleImport}>
                Импорт
              </button>
            </div>
            {importResult && (
              <div className={`p-3 rounded-lg text-sm ${importResult.errors.length > 0 ? 'bg-ember/10 text-ember' : 'bg-sage/10 text-sage'}`}>
                {importResult.errors.length > 0 ? (
                  <p>Ошибки: {importResult.errors.join('; ')}</p>
                ) : (
                  <p>Импортировано записей: {importResult.imported}</p>
                )}
              </div>
            )}
            <p className="text-xs text-dusk/40">
              API-ключ не включается в бэкап. При импорте ключ нужно ввести заново.
            </p>
          </div>
        </section>

        {/* Сохранить */}
        <button
          className="btn-primary w-full py-4 text-lg"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Сохраняем...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  );
}
