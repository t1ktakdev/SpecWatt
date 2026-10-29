import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { ApiError } from '../specwatt/api';
import { scheduleFromForm } from '../specwatt/scheduler-api';
import {localStartToUtc, formatLocalStart} from '../specwatt/schedule-time';
import type { ScheduleEvaluation, ScheduleInput, SchedulerApi, ServerSchedule } from '../specwatt/scheduler-api';
import { Copy, CTA, Panel } from '../specwatt/ui';
import { sty, theme } from '../specwatt/theme';
import { isSessionFailure, isAmbiguousMutationOutcome } from '../specwatt/server-request-scope';

export type ServerSchedulesProps = {
  api: SchedulerApi;
  initialChannel?: 'CH1' | 'CH2';
  controllerId: string;
  locale: 'ru' | 'ky';
  onChanged: () => void | Promise<void>;
  onSessionExpired: () => void;
};
const active = (row: ServerSchedule) => ['pending', 'running', 'uncertain'].includes(row.status);

/** Server records only. No offline planner, device acknowledgement or automatic tick. */
export default function ServerSchedules(props: ServerSchedulesProps) {
  return <SchedulePanel key={props.controllerId} {...props} />;
}

function SchedulePanel({ api, controllerId, locale, onChanged, onSessionExpired, initialChannel = 'CH1' }: ServerSchedulesProps) {
  const w = (ru: string, ky: string) => locale === 'ky' ? ky : ru;
  const stamp = (seconds: number) => new Date(seconds * 1000).toLocaleString(locale === 'ky' ? 'ky-KG' : 'ru-RU') + ' · ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [rows, setRows] = useState<ServerSchedule[]>([]);
  const [channel, setChannel] = useState<'CH1' | 'CH2'>(initialChannel);
  const [action, setAction] = useState<'on' | 'off'>('on');
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState('30');
  const [preview, setPreview] = useState<ScheduleEvaluation | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [previewInput,setPreviewInput] = useState<ScheduleInput|null>(null);
  const [previewZone,setPreviewZone] = useState('');
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [serverTime, setServerTime] = useState<number | null>(null);
  const lock = useRef(false), generation = useRef(0);
  const expiredCallback = useRef(onSessionExpired);
  useEffect(() => { expiredCallback.current = onSessionExpired; }, [onSessionExpired]);
  const formKey = JSON.stringify([channel, action, start, duration]);
  const canCreate = preview?.feasible && previewKey === formKey && previewInput!==null && previewZone===zone && !uncertain;

  useEffect(() => {
    const current = ++generation.current;
    const abort = new AbortController();
    lock.current = true;
    void api.list(controllerId, abort.signal).then(value => {
      if (generation.current === current) setRows(value);
    }).catch(failure => {
      if (generation.current === current) {
        const code = failure instanceof ApiError ? failure.code : 'operation_failed';
        if (isSessionFailure(code)) expiredCallback.current();
        else setError(code);
      }
    }).finally(() => {
      if (generation.current === current) { lock.current = false; setBusy(false); }
    });
    return () => { generation.current = current + 1; abort.abort(); };
  }, [api, controllerId]);

  async function perform(job: () => Promise<void>, mutation = false) {
    if (lock.current || (mutation && uncertain)) return;
    const current = generation.current;
    lock.current = true; setBusy(true); setError('');
    try { await job(); }
    catch (failure) {
      if (generation.current !== current) return;
      const code = failure instanceof ApiError ? failure.code : 'operation_failed';
      if (isSessionFailure(code)) { expiredCallback.current(); return; }
      setError(code);
      if (mutation && isAmbiguousMutationOutcome(code)) setUncertain(true);
    } finally {
      if (generation.current === current) { lock.current = false; setBusy(false); }
    }
  }
  function plan(): ScheduleInput {
    return scheduleFromForm({ channel, action, start: localStartToUtc(start), minutes: duration });
  }
  async function reload(current = generation.current) {
    const value = await api.list(controllerId);
    if (generation.current === current) { setRows(value); setUncertain(false); setCancelId(null); }
  }
  async function changed(current: number) {
    if (generation.current !== current) return;
    await reload(current);
    if (generation.current === current) await onChanged();
  }
  const labels: Record<string, string> = {
    pending: w('Ожидает окна', 'Убактысын күтүүдө'), running: w('Исполняется', 'Аткарылууда'),
    completed: w('Завершено симулятором', 'Симулятор аяктады'), cancelled: w('Отменено', 'Жокко чыгарылды'),
    rejected: w('Отклонено', 'Четке кагылды'), uncertain: w('Результат неясен', 'Жыйынтык белгисиз'),
    protected_channel: w('CH3 защищён.', 'CH3 корголгон.'),
    timezone_changed: w('Часовой пояс изменился. Проверьте окно заново перед созданием.', 'Убакыт алкагы өзгөрдү. Түзүүдөн мурда убакытты кайра текшериңиз.'),
    invalid_local_time: w('Введите ДД.ММ.ГГГГ ЧЧ:ММ. Несуществующее или повторяющееся время при смене часового пояса не принимается.', 'КК.АА.ЖЖЖЖ СС:ММ киргизиңиз. Убакыт алкагы өзгөргөндө жок же кайталанган убакыт кабыл алынбайт.'),
    invalid_schedule: w('Проверьте начало и длительность: от 1 секунды до 7 суток.', 'Башталышын жана узактыгын текшериңиз: 1 секунддан 7 күнгө чейин.'),
    stale_measurements: w('Измерения устарели. Обновите телеметрию симулятора отдельно.', 'Өлчөөлөр эскирди. Симулятордун телеметриясын өзүнчө жаңыртыңыз.'),
    automation_not_allowed: w('Владелец ещё не разрешил автоматизацию канала.', 'Ээси каналды автоматташтырууга уруксат бере элек.'),
    manual_priority_active: w('Действует ручной приоритет.', 'Кол артыкчылыгы иштеп жатат.'),
    peak_exceeded: w('Прогноз превышает предел мощности.', 'Божомол кубат чегинен ашат.'),
    nominal_exceeds_peak: w('Мощность нагрузки не помещается в предел.', 'Жүктүн кубаты чектен ашат.'),
    schedule_conflict: w('Окно пересекается с другим расписанием.', 'Убакыт башка график менен кесилишет.'),
    window_in_past: w('Начало уже прошло по часам сервера.', 'Сервердин сааты боюнча башталышы өттү.'),
    window_too_far: w('Начало должно быть в ближайшие 7 суток.', 'Башталышы жакынкы 7 күндүн ичинде болсун.'),
    invalid_time_window: w('Сервер отклонил время окна.', 'Сервер графиктин убактысын четке какты.'),
    schedule_not_active: w('Расписание уже завершено. Обновите список.', 'График аяктаган. Тизмени жаңыртыңыз.'),
    schedule_not_found: w('Расписание не найдено. Обновите список.', 'График табылган жок. Тизмени жаңыртыңыз.'),
    controller_not_found: w('Симулятор не найден или удалён на сервере. Обновите список симуляторов.', 'Симулятор табылган жок же серверден өчүрүлгөн. Симуляторлор тизмесин жаңыртыңыз.'),
    request_timeout: w('Ответ не получен. Обновите список перед новым действием.', 'Жооп келген жок. Жаңы аракеттен мурда тизмени жаңыртыңыз.'),
    network_error: w('Нет связи. Обновите список после восстановления сети.', 'Байланыш жок. Тармак калыбына келгенде тизмени жаңыртыңыз.'),
    invalid_response: w('Сервер вернул некорректные данные. Обновите список.', 'Сервер туура эмес маалымат кайтарды. Тизмени жаңыртыңыз.'),
    invalid_session: w('Сессия истекла. Войдите снова.', 'Сессия бүттү. Кайра кириңиз.'),
    session_required: w('Войдите в серверную сессию.', 'Серверге кириңиз.'),
    rate_limited: w('Слишком много запросов. Повторите позже.', 'Суроо өтө көп. Кийин кайталаңыз.'),
  };
  const explain = (code: string) => labels[code] ?? w('Сервер отклонил действие. Обновите состояние и проверьте условия.', 'Сервер аракетти четке какты. Абалды жаңыртып, шарттарды текшериңиз.');

  return <Panel style={{ gap: 12 }}>
    <Copy size={22}>{w('Новое расписание', 'Жаңы график')}</Copy>
    <Copy muted>{w('Только серверный симулятор. CH3 защищён. Запрос команды не означает её исполнение.', 'Сервердик симулятор гана. CH3 корголгон. Буйрукту суроо анын аткарылышын билдирбейт.')}</Copy>
    <Copy muted>{w('Выберите местное время. Перед сохранением сервер проверит лимит мощности и разрешения.', 'Жергиликтүү убакытты тандаңыз. Сактоодон мурда сервер кубат чегин жана уруксаттарды текшерет.')}</Copy>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(['CH1', 'CH2'] as const).map(id => <CTA key={id} label={id} secondary={channel !== id} disabled={busy} onPress={() => setChannel(id)} />)}
    </View>
    <View style={{ gap: 8 }}>
      <CTA label={w('Включить на время', 'Убактылуу күйгүзүү')} secondary={action !== 'on'} disabled={busy} onPress={() => setAction('on')} />
      <CTA label={w('Выключить в указанное время', 'Белгиленген убакта өчүрүү')} secondary={action !== 'off'} disabled={busy} onPress={() => setAction('off')} />
    </View>
    <Copy>{w('Начало по местному времени', 'Жергиликтүү убакыт боюнча башталышы')}</Copy>
    <Copy muted size={14}>{Intl.DateTimeFormat().resolvedOptions().timeZone} · {w('ДД.ММ.ГГГГ ЧЧ:ММ', 'КК.АА.ЖЖЖЖ СС:ММ')}</Copy>
    <TextInput style={sty.field} accessibilityLabel={w('Начало расписания по местному времени', 'Графиктин жергиликтүү убакыт боюнча башталышы')} value={start} onChangeText={setStart} editable={!busy}
      autoCapitalize="none" autoCorrect={false} placeholder="29.10.2026 20:30" placeholderTextColor={theme.muted} maxLength={16} />
    <View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>
      {[15,60].map(minutes=><CTA key={minutes} secondary disabled={busy} label={minutes===15?w('Через 15 мин', '15 мүнөттөн кийин'):w('Через час', 'Бир сааттан кийин')} onPress={()=>setStart(formatLocalStart(new Date(Date.now()+minutes*60000)))}/>)}
    </View>
    {action === 'on' && <><Copy>{w('Длительность, минуты (до 7 суток)', 'Узактыгы, мүнөт (7 күнгө чейин)')}</Copy>
      <TextInput style={sty.field} accessibilityLabel={w('Длительность в минутах', 'Узактыгы мүнөт менен')} value={duration} onChangeText={setDuration}
        editable={!busy} keyboardType="decimal-pad" maxLength={12} /></>}
    <CTA label={w('Проверить окно', 'Убакытты текшерүү')} secondary disabled={busy || uncertain} onPress={() => void perform(async () => {
      const current = generation.current, key = formKey, input = plan(), evaluatedZone = zone;
      const result = await api.evaluate(controllerId, input);
      if (generation.current === current) { setPreview(result); setPreviewKey(key); setPreviewInput(input); setPreviewZone(evaluatedZone); }
    })} />
    {preview && previewKey === formKey && <View style={{ gap: 8, padding:16, borderRadius:16, backgroundColor:theme.raised }}>
      <Copy size={18}>{w('Проверьте перед созданием', 'Түзүүдөн мурда текшериңиз')}</Copy>
      <Copy>{channel} · {start} · {previewZone}</Copy>
      <Copy muted size={14}>{w('Передадим серверу', 'Серверге жөнөтүлөт')}: {previewInput?new Date(previewInput.start_at*1000).toISOString():"—"}</Copy>
      {previewZone!==zone&&<Copy style={{color:theme.error}}>{explain("timezone_changed")}</Copy>}
      <Copy accent={preview.feasible}>{preview.feasible ? w('Окно допустимо сейчас. При исполнении условия проверяются снова.', 'Убакыт азыр жарактуу. Аткарууда шарттар кайра текшерилет.') : w('Окно отклонено.', 'Убакыт четке кагылды.')}</Copy>
      {preview.checks.filter(c => !c.ok).map(c => <Copy key={c.code}>{explain(c.code)}</Copy>)}
      {preview.projection && <Copy muted>{w('Прогноз пика', 'Чокунун божомолу')}: {preview.projection.projected_peak_watts} W · {w('Энергия нагрузки', 'Жүктүн энергиясы')}: {preview.projection.device_energy_wh} Wh</Copy>}
      {preview.suggestions.map(s => <Copy key={s.start_at} muted>{w('Другое окно', 'Башка убакыт')}: {stamp(s.start_at)} — {stamp(s.end_at)}</Copy>)}
    </View>}
    <CTA label={w('Подтвердить создание расписания', 'График түзүүнү ырастоо')} disabled={busy || !canCreate} onPress={() => void perform(async () => {
      const current = generation.current;
      if(!previewInput||previewZone!==Intl.DateTimeFormat().resolvedOptions().timeZone)throw new ApiError('timezone_changed');
      await api.create(controllerId, previewInput);
      if (generation.current === current) setPreview(null);
      await changed(current);
    }, true)} />
    {uncertain && <Copy style={{ color: theme.error }}>{w('Результат последнего запроса неясен. Не создавайте дубликат; сначала обновите список.', 'Акыркы суроонун жыйынтыгы белгисиз. Кайталабаңыз; адегенде тизмени жаңыртыңыз.')}</Copy>}
    {error ? <Copy accessibilityRole="alert" style={{ color: theme.error }}>{explain(error)}</Copy> : null}
    {busy && <ActivityIndicator color={theme.peach} accessibilityLabel={w('Загрузка расписаний', 'Графиктер жүктөлүүдө')} />}
    <CTA label={w('Обновить список', 'Тизмени жаңыртуу')} secondary disabled={busy} onPress={() => void perform(reload)} />
    <Copy size={20}>{w('Сохранённые расписания', 'Сакталган графиктер')}</Copy>
    <Copy muted>{w('Последние 100 записей. Время сервера показано в вашем часовом поясе.', 'Акыркы 100 жазуу. Сервердин убактысы сиздин убакыт алкагыңызда көрсөтүлгөн.')}</Copy>
    {!busy && !rows.length && <Copy muted>{w('Сохранённых расписаний нет.', 'Сакталган график жок.')}</Copy>}
    {rows.map(row => <View key={row.id} style={{ borderTopWidth: 1, borderColor: theme.line, paddingTop: 12, gap: 7 }}>
      <Copy>{row.channel_id} · {row.action === 'on' ? w('Включить', 'Күйгүзүү') : w('Выключить', 'Өчүрүү')} · {labels[row.status]}</Copy>
      <Copy size={15}>{stamp(row.start_at)}{row.action === 'on' ? '\n→ ' + stamp(row.end_at) : ''}</Copy>
      <Copy size={14} muted>{w('Обновлено сервером', 'Сервер жаңыртты')}: {stamp(row.updated_at)}</Copy>
      {row.rejection_reason && <Copy>{explain(row.rejection_reason.replace(/^end_phase_/, ''))}</Copy>}
      {active(row) && (cancelId === row.id ? <View style={{ gap: 8 }}>
        <Copy>{w('Отмена убирает будущие фазы и ещё не отправленный запрос. Уже включённая нагрузка останется включённой; выключите её отдельной командой.', 'Жокко чыгаруу келечектеги кадамдарды жана жөнөтүлө элек суроону алып салат. Күйгөн жүк күйүп калат; өзүнчө буйрук менен өчүрүңүз.')}</Copy>
        <CTA label={w('Подтвердить отмену', 'Жокко чыгарууну ырастоо')} disabled={busy || uncertain} onPress={() => void perform(async () => { const current = generation.current; await api.cancel(controllerId, row.id); await changed(current); }, true)} />
        <CTA label={w('Оставить расписание', 'Графикти калтыруу')} secondary disabled={busy} onPress={() => setCancelId(null)} />
      </View> : <CTA label={w('Отменить расписание', 'Графикти жокко чыгаруу')} secondary disabled={busy || uncertain} onPress={() => setCancelId(row.id)} />)}
    </View>)}
    <Copy muted>{w('Один проход проверяет наступившие окна. Он не подтверждает команды и не обновляет телеметрию. Фоновая проверка возможна только при включённом фоновом режиме сервера.', 'Бир өтүү убактысы келген графиктерди текшерет. Ал буйрукту ырастабайт жана телеметрияны жаңыртпайт. Фондук текшерүү серверде иштетилсе гана иштейт.')}</Copy>
    <CTA label={w('Проверить наступившие окна', 'Убактысы келген графиктерди текшерүү')} secondary disabled={busy || uncertain} onPress={() => void perform(async () => {
      const current = generation.current, result = await api.tick(controllerId);
      if (generation.current === current) setServerTime(result.now);
      await changed(current);
    }, true)} />
    {serverTime !== null && <Copy muted>{w('Последняя проверка по часам сервера', 'Сервер сааты боюнча акыркы текшерүү')}: {stamp(serverTime)}</Copy>}
  </Panel>;
}
