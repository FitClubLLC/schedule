import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  ActivityIndicator, ScrollView, TextInput,
  KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import { useUser, useAuth } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = 'location' | 'type' | 'date' | 'time' | 'confirm' | 'success';
interface BookingLocation  { id: string; name: string; }
interface AppointmentType  { id: number; name: string; duration: number; price: string; description?: string | null; }
interface AvailableTime    { time: string; slotsAvailable: number; }
interface CreatedAppt      { id: number; type: string; date: string; time: string; calendar: string; location?: string | null; }

// ── Location accent palette ───────────────────────────────────────────────────
const LOC_COLORS = [
  { main: '#D3AF37', muted: '#D3AF3722', border: '#D3AF3766' },   // POTOMAC  — gold
  { main: '#4A9EFF', muted: '#4A9EFF22', border: '#4A9EFF66' },   // KENTLANDS — blue
];

// ── Calendar helpers ──────────────────────────────────────────────────────────
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function calDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  const days: (Date | null)[] = [];
  for (let i = 0; i < first; i++) days.push(null);
  for (let d = 1; d <= total; d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  return days;
}
function shiftMonth(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}
function fmtDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(dateStr + 'T12:00:00'));
}
function fmtMonth(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
}

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STEP_ORDER: Exclude<Step, 'success'>[] = ['location', 'type', 'date', 'time', 'confirm'];
const STEP_TITLES: Record<Step, string> = {
  location: 'BOOK A SESSION',
  type:     'SESSION TYPE',
  date:     'CHOOSE DATE',
  time:     'CHOOSE TIME',
  confirm:  'CONFIRM',
  success:  'CONFIRMED',
};

// ── Main screen ───────────────────────────────────────────────────────────────
export default function BookScreen() {
  const colors      = useColors();
  const insets      = useSafeAreaInsets();
  const { user }    = useUser();
  const { getToken } = useAuth();
  const { width }   = useWindowDimensions();
  const qc          = useQueryClient();

  const topPad  = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const cellSz  = Math.floor((width - 48) / 7);   // 24px padding each side

  // ── Wizard state ──
  const [step,        setStep]        = useState<Step>('location');
  const [locId,       setLocId]       = useState<string | null>(null);
  const [locName,     setLocName]     = useState('');
  const [accentIdx,   setAccentIdx]   = useState(0);
  const [typeId,      setTypeId]      = useState<number | null>(null);
  const [typeName,    setTypeName]    = useState('');
  const [typeDur,     setTypeDur]     = useState(0);
  const [curMonth,    setCurMonth]    = useState(() => new Date());
  const [selDate,     setSelDate]     = useState<string | null>(null);
  const [selTime,     setSelTime]     = useState<string | null>(null);
  const [firstName,   setFirstName]   = useState('');
  const [lastName,    setLastName]    = useState('');
  const [email,       setEmail]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [notes,       setNotes]       = useState('');
  const [createdAppt, setCreatedAppt] = useState<CreatedAppt | null>(null);
  const [submitErr,   setSubmitErr]   = useState<string | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  // Pre-fill from Clerk
  useEffect(() => {
    if (!user) return;
    if (!firstName && user.firstName) setFirstName(user.firstName);
    if (!lastName  && user.lastName)  setLastName(user.lastName);
    const em = user.primaryEmailAddress?.emailAddress;
    if (!email && em) setEmail(em);
  }, [user]);

  const todayStr  = toDateStr(new Date());
  const monthStr  = `${curMonth.getFullYear()}-${String(curMonth.getMonth() + 1).padStart(2, '0')}`;
  const accent    = LOC_COLORS[accentIdx % LOC_COLORS.length];
  const days      = calDays(curMonth.getFullYear(), curMonth.getMonth());

  // ── API helper ────────────────────────────────────────────────────────────
  async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const token  = await getToken();
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const url    = domain ? `https://${domain}${path}` : path;
    const res    = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error((err as any).error || `Error ${res.status}`);
    }
    return res.json();
  }

  // ── Queries ───────────────────────────────────────────────────────────────
  const locQ = useQuery({
    queryKey: ['booking', 'locations'],
    queryFn:  () => apiFetch<BookingLocation[]>('/api/booking/locations'),
    staleTime: 5 * 60_000,
  });

  const typeQ = useQuery({
    queryKey: ['booking', 'appointment-types'],
    queryFn:  () => apiFetch<AppointmentType[]>('/api/booking/appointment-types'),
    enabled:  step === 'type',
    staleTime: 10 * 60_000,
  });

  const dateQ = useQuery({
    queryKey: ['booking', 'dates', locId, typeId, monthStr],
    queryFn:  () => {
      const q = new URLSearchParams({ locationId: locId!, appointmentTypeID: String(typeId!), month: monthStr });
      return apiFetch<string[]>(`/api/booking/availability/dates?${q}`);
    },
    enabled:  step === 'date' && !!locId && !!typeId,
    staleTime: 2 * 60_000,
  });

  const timeQ = useQuery({
    queryKey: ['booking', 'times', locId, typeId, selDate],
    queryFn:  () => {
      const q = new URLSearchParams({ locationId: locId!, appointmentTypeID: String(typeId!), date: selDate! });
      return apiFetch<AvailableTime[]>(`/api/booking/availability/times?${q}`);
    },
    enabled:  step === 'time' && !!locId && !!typeId && !!selDate,
    staleTime: 60_000,
  });

  const availDates = dateQ.data ?? [];
  const availSet   = new Set(availDates);
  const availTimes = timeQ.data ?? [];

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!locId || !typeId || !selDate || !selTime) return;
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setSubmitErr('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const result = await apiFetch<CreatedAppt>('/api/booking/appointments', {
        method: 'POST',
        body:   JSON.stringify({
          locationId: locId, appointmentTypeID: typeId,
          datetime: selTime, firstName: firstName.trim(),
          lastName: lastName.trim(), email: email.trim(),
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      setCreatedAppt(result);
      setStep('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['appointments'] });
    } catch (err: any) {
      setSubmitErr(err.message || 'Booking failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const reset = () => {
    setStep('location'); setLocId(null); setLocName(''); setAccentIdx(0);
    setTypeId(null); setTypeName(''); setTypeDur(0);
    setCurMonth(new Date()); setSelDate(null); setSelTime(null);
    setPhone(''); setNotes(''); setCreatedAppt(null); setSubmitErr(null);
  };

  const canGoBack = step !== 'location' && step !== 'success';
  const backStep: Record<Step, Step> = {
    location: 'location', type: 'location', date: 'type',
    time: 'date', confirm: 'time', success: 'success',
  };
  const handleBack = () => {
    if (!canGoBack) return;
    if (step === 'time') setSelTime(null);
    setStep(backStep[step]);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={s.hRow}>
          {canGoBack
            ? <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="chevron-left" size={24} color={colors.foreground} />
              </TouchableOpacity>
            : <View style={{ width: 24 }} />}
          <Text style={[s.hTitle, { color: colors.foreground }]}>{STEP_TITLES[step]}</Text>
          <View style={{ width: 24 }} />
        </View>

        {step !== 'success' && (
          <View style={s.dots}>
            {STEP_ORDER.map((sid, i) => {
              const ci = STEP_ORDER.indexOf(step as Exclude<Step, 'success'>);
              const done = i < ci;
              const cur  = i === ci;
              return (
                <View key={sid} style={s.dotRow}>
                  {i > 0 && (
                    <View style={[s.dotLine, { backgroundColor: done ? accent.main : colors.border }]} />
                  )}
                  <View style={[
                    s.dot,
                    { borderColor: (done || cur) ? accent.main : colors.border },
                    (done || cur) && { backgroundColor: accent.main },
                  ]} />
                </View>
              );
            })}
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ════════════════════ LOCATION ════════════════════ */}
        {step === 'location' && (
          <View style={s.section}>
            <Text style={[s.sub, { color: colors.mutedForeground }]}>Choose your location</Text>
            {locQ.isLoading
              ? [0, 1].map(i => <View key={i} style={[s.skelBox, { backgroundColor: colors.muted }]} />)
              : (locQ.data ?? []).map((loc, i) => {
                  const c = LOC_COLORS[i % LOC_COLORS.length];
                  return (
                    <TouchableOpacity
                      key={loc.id}
                      style={[s.locCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: c.main }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setLocId(loc.id); setLocName(loc.name); setAccentIdx(i);
                        setStep('type');
                      }}
                      activeOpacity={0.78}
                    >
                      <View style={[s.locIcon, { backgroundColor: c.muted }]}>
                        <Feather name="map-pin" size={20} color={c.main} />
                      </View>
                      <View style={s.locInfo}>
                        <Text style={[s.locName, { color: colors.foreground }]}>{loc.name}</Text>
                        <Text style={[s.locSub, { color: colors.mutedForeground }]}>View availability &amp; book</Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={c.main} />
                    </TouchableOpacity>
                  );
                })}
          </View>
        )}

        {/* ════════════════════ SESSION TYPE ════════════════════ */}
        {step === 'type' && (
          <View style={s.section}>
            <LocBadge name={locName} accent={accent} />
            {typeQ.isLoading
              ? [0,1,2].map(i => <View key={i} style={[s.skelBox, { backgroundColor: colors.muted }]} />)
              : (typeQ.data ?? []).map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[s.typeCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: accent.main }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setTypeId(t.id); setTypeName(t.name); setTypeDur(t.duration);
                      setStep('date');
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={s.typeInfo}>
                      <Text style={[s.typeName, { color: colors.foreground }]}>{t.name}</Text>
                      <View style={s.typeMeta}>
                        <Feather name="clock" size={12} color={colors.mutedForeground} />
                        <Text style={[s.metaTxt, { color: colors.mutedForeground }]}>{t.duration} min</Text>
                        {parseFloat(t.price) > 0 && (
                          <>
                            <Feather name="dollar-sign" size={12} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
                            <Text style={[s.metaTxt, { color: colors.mutedForeground }]}>{t.price}</Text>
                          </>
                        )}
                      </View>
                    </View>
                    <Feather name="chevron-right" size={18} color={accent.main} />
                  </TouchableOpacity>
                ))}
            {!typeQ.isLoading && (typeQ.data ?? []).length === 0 && (
              <Text style={[s.emptyTxt, { color: colors.mutedForeground }]}>No session types available.</Text>
            )}
          </View>
        )}

        {/* ════════════════════ DATE ════════════════════ */}
        {step === 'date' && (
          <View style={s.section}>
            <View style={s.badgeRow}>
              <LocBadge name={locName} accent={accent} />
              <Text style={[s.typeChip, { color: colors.mutedForeground }]}>{typeName}</Text>
            </View>

            {/* Month navigation */}
            <View style={s.monthNav}>
              <TouchableOpacity
                onPress={() => { setCurMonth(d => shiftMonth(d, -1)); setSelDate(null); }}
                disabled={monthStr <= todayStr.slice(0, 7)}
                style={[s.monthBtn, { borderColor: colors.border }]}
              >
                <Feather name="chevron-left" size={18} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[s.monthLbl, { color: colors.foreground }]}>{fmtMonth(curMonth)}</Text>
              <TouchableOpacity
                onPress={() => { setCurMonth(d => shiftMonth(d, 1)); setSelDate(null); }}
                style={[s.monthBtn, { borderColor: colors.border }]}
              >
                <Feather name="chevron-right" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Day-of-week headers */}
            <View style={s.calHeader}>
              {DOW.map((d, i) => (
                <View key={i} style={[s.calCell, { width: cellSz }]}>
                  <Text style={[s.dowLbl, { color: colors.mutedForeground }]}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Calendar grid */}
            <View style={s.calGrid}>
              {(dateQ.isFetching || dateQ.isLoading) && (
                <View style={[s.calOverlay, { backgroundColor: colors.background + 'CC' }]}>
                  <ActivityIndicator color={accent.main} />
                </View>
              )}
              {days.map((day, i) => {
                if (!day) return <View key={`e-${i}`} style={{ width: cellSz, height: cellSz }} />;
                const ds     = toDateStr(day);
                const avail  = availSet.has(ds);
                const past   = ds < todayStr;
                const sel    = ds === selDate;
                return (
                  <View key={ds} style={{ width: cellSz, height: cellSz, alignItems: 'center', justifyContent: 'center' }}>
                    <TouchableOpacity
                      disabled={!avail || past}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelDate(ds); setSelTime(null); setStep('time');
                      }}
                      style={[
                        s.calDayBtn,
                        { width: cellSz - 6, height: cellSz - 6 },
                        sel         && { backgroundColor: accent.main },
                        !sel && avail && !past && { borderWidth: 1.5, borderColor: accent.main },
                      ]}
                      activeOpacity={0.65}
                    >
                      <Text style={[
                        s.calDayNum,
                        sel                   && { color: '#000', fontFamily: 'Inter_700Bold' },
                        !sel && avail && !past  && { color: accent.main, fontFamily: 'Inter_600SemiBold' },
                        (!avail || past)       && { color: colors.mutedForeground + '33' },
                      ]}>
                        {day.getDate()}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {!dateQ.isFetching && !dateQ.isLoading && availDates.length === 0 && (
              <Text style={[s.emptyTxt, { color: colors.mutedForeground, textAlign: 'center' }]}>
                No availability this month.
              </Text>
            )}
          </View>
        )}

        {/* ════════════════════ TIME ════════════════════ */}
        {step === 'time' && selDate && (
          <View style={s.section}>
            <LocBadge name={locName} accent={accent} />
            <Text style={[s.dateLbl, { color: colors.foreground }]}>{fmtDate(selDate)}</Text>

            {timeQ.isLoading
              ? <ActivityIndicator color={accent.main} style={{ marginTop: 24 }} />
              : availTimes.length === 0
                ? <Text style={[s.emptyTxt, { color: colors.mutedForeground }]}>No times available for this date.</Text>
                : (
                  <>
                    <View style={s.timeGrid}>
                      {availTimes.map(slot => {
                        const active = selTime === slot.time;
                        return (
                          <TouchableOpacity
                            key={slot.time}
                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelTime(slot.time); }}
                            style={[
                              s.timeBtn,
                              { borderColor: active ? accent.main : colors.border },
                              active && { backgroundColor: accent.muted },
                            ]}
                          >
                            <Text style={[s.timeTxt, { color: active ? accent.main : colors.foreground }]}>
                              {fmtTime(slot.time)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TouchableOpacity
                      disabled={!selTime}
                      onPress={() => setStep('confirm')}
                      style={[s.cta, { backgroundColor: selTime ? accent.main : colors.muted }]}
                    >
                      <Text style={[s.ctaTxt, { color: selTime ? '#000' : colors.mutedForeground }]}>CONTINUE</Text>
                    </TouchableOpacity>
                  </>
                )}
          </View>
        )}

        {/* ════════════════════ CONFIRM ════════════════════ */}
        {step === 'confirm' && selDate && selTime && (
          <View style={s.section}>
            {/* Summary */}
            <View style={[s.summCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.summHead}>
                <Text style={[s.summTitle, { color: colors.foreground }]}>{typeName}</Text>
                <LocBadge name={locName} accent={accent} />
              </View>
              <View style={[s.divider, { backgroundColor: colors.border }]} />
              <View style={s.metaRow}>
                <Feather name="calendar" size={13} color={colors.mutedForeground} />
                <Text style={[s.metaTxt, { color: colors.mutedForeground }]}>{fmtDate(selDate)}</Text>
              </View>
              <View style={[s.metaRow, { marginTop: 6 }]}>
                <Feather name="clock" size={13} color={colors.mutedForeground} />
                <Text style={[s.metaTxt, { color: colors.mutedForeground }]}>{fmtTime(selTime)} · {typeDur} min</Text>
              </View>
            </View>

            {/* Form */}
            <View style={s.formGrid}>
              <View style={{ flex: 1 }}>
                <Text style={[s.lbl, { color: colors.mutedForeground }]}>FIRST NAME *</Text>
                <TextInput value={firstName} onChangeText={setFirstName} placeholder="First name"
                  placeholderTextColor={colors.mutedForeground}
                  style={[s.inp, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.lbl, { color: colors.mutedForeground }]}>LAST NAME *</Text>
                <TextInput value={lastName} onChangeText={setLastName} placeholder="Last name"
                  placeholderTextColor={colors.mutedForeground}
                  style={[s.inp, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
              </View>
            </View>

            <View>
              <Text style={[s.lbl, { color: colors.mutedForeground }]}>EMAIL *</Text>
              <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
                placeholder="Email address" placeholderTextColor={colors.mutedForeground}
                style={[s.inp, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
            </View>
            <View>
              <Text style={[s.lbl, { color: colors.mutedForeground }]}>PHONE</Text>
              <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                placeholder="Phone (optional)" placeholderTextColor={colors.mutedForeground}
                style={[s.inp, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
            </View>
            <View>
              <Text style={[s.lbl, { color: colors.mutedForeground }]}>NOTES</Text>
              <TextInput value={notes} onChangeText={setNotes} multiline numberOfLines={3}
                placeholder="Anything we should know? (optional)" placeholderTextColor={colors.mutedForeground}
                style={[s.inp, s.inpMulti, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
            </View>

            {submitErr && (
              <View style={[s.errBox, { borderColor: '#ff4444', backgroundColor: '#ff444418' }]}>
                <Feather name="alert-circle" size={14} color="#ff4444" />
                <Text style={[s.errTxt, { color: '#ff4444' }]}>{submitErr}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting || !firstName.trim() || !lastName.trim() || !email.trim()}
              style={[s.cta, { backgroundColor: (!submitting && firstName.trim() && lastName.trim() && email.trim()) ? accent.main : colors.muted }]}
            >
              {submitting
                ? <ActivityIndicator color="#000" />
                : <Text style={[s.ctaTxt, { color: (!submitting && firstName.trim()) ? '#000' : colors.mutedForeground }]}>BOOK SESSION</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ════════════════════ SUCCESS ════════════════════ */}
        {step === 'success' && createdAppt && (
          <View style={[s.section, s.successSection]}>
            <View style={[s.successIcon, { backgroundColor: accent.muted }]}>
              <Feather name="check-circle" size={44} color={accent.main} />
            </View>
            <Text style={[s.successTitle, { color: colors.foreground }]}>You're Booked!</Text>
            <Text style={[s.successSub, { color: colors.mutedForeground }]}>Your session is confirmed.</Text>

            <View style={[s.summCard, { backgroundColor: colors.card, borderColor: colors.border, width: '100%' }]}>
              <View style={s.summHead}>
                <Text style={[s.summTitle, { color: colors.foreground, flex: 1 }]}>{createdAppt.type}</Text>
                <LocBadge name={locName} accent={accent} />
              </View>
              <View style={[s.divider, { backgroundColor: colors.border }]} />
              <View style={s.metaRow}>
                <Feather name="calendar" size={13} color={colors.mutedForeground} />
                <Text style={[s.metaTxt, { color: colors.mutedForeground }]}>{fmtDate(createdAppt.date)}</Text>
              </View>
              <View style={[s.metaRow, { marginTop: 6 }]}>
                <Feather name="clock" size={13} color={colors.mutedForeground} />
                <Text style={[s.metaTxt, { color: colors.mutedForeground }]}>{fmtTime(createdAppt.time)}</Text>
              </View>
            </View>

            <TouchableOpacity onPress={reset} style={[s.cta, { backgroundColor: accent.main, width: '100%', marginTop: 8 }]}>
              <Text style={[s.ctaTxt, { color: '#000' }]}>BOOK ANOTHER</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Location badge atom ───────────────────────────────────────────────────────
function LocBadge({ name, accent }: { name: string; accent: typeof LOC_COLORS[0] }) {
  return (
    <View style={[s.locBadge, { backgroundColor: accent.muted, borderColor: accent.border }]}>
      <Feather name="map-pin" size={11} color={accent.main} />
      <Text style={[s.locBadgeTxt, { color: accent.main }]}>{name}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:         { flex: 1 },
  header:       { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  hRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  hTitle:       { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 20, letterSpacing: 2, textAlign: 'center', flex: 1 },
  dots:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dotRow:       { flexDirection: 'row', alignItems: 'center' },
  dot:          { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  dotLine:      { width: 20, height: 1.5, marginHorizontal: 4 },
  scroll:       { paddingHorizontal: 24, paddingTop: 24, gap: 14 },
  section:      { gap: 14 },
  sub:          { fontFamily: 'Inter_400Regular', fontSize: 14 },
  skelBox:      { height: 96, borderRadius: 12 },
  // Location
  locCard:      { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 12, borderWidth: 1, borderLeftWidth: 3, padding: 18 },
  locIcon:      { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  locInfo:      { flex: 1, gap: 3 },
  locName:      { fontFamily: 'BarlowCondensed_700Bold', fontSize: 22, letterSpacing: 1 },
  locSub:       { fontFamily: 'Inter_400Regular', fontSize: 12 },
  // Badge
  badgeRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  locBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start' },
  locBadgeTxt:  { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  typeChip:     { fontFamily: 'Inter_400Regular', fontSize: 13 },
  // Type
  typeCard:     { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderLeftWidth: 3, padding: 16, gap: 12 },
  typeInfo:     { flex: 1, gap: 5 },
  typeName:     { fontFamily: 'BarlowCondensed_700Bold', fontSize: 20, letterSpacing: 0.5 },
  typeMeta:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaTxt:      { fontFamily: 'Inter_400Regular', fontSize: 12 },
  emptyTxt:     { fontFamily: 'Inter_400Regular', fontSize: 13 },
  // Calendar
  monthNav:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthBtn:     { width: 36, height: 36, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  monthLbl:     { fontFamily: 'BarlowCondensed_700Bold', fontSize: 18, letterSpacing: 0.5 },
  calHeader:    { flexDirection: 'row', marginBottom: 2 },
  calCell:      { alignItems: 'center', justifyContent: 'center' },
  dowLbl:       { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.5 },
  calGrid:      { flexDirection: 'row', flexWrap: 'wrap', position: 'relative' },
  calOverlay:   { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: 8 },
  calDayBtn:    { borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  calDayNum:    { fontFamily: 'Inter_500Medium', fontSize: 13 },
  dateLbl:      { fontFamily: 'BarlowCondensed_700Bold', fontSize: 20, letterSpacing: 0.5, marginBottom: 4 },
  // Time
  timeGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeBtn:      { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, minWidth: 100 },
  timeTxt:      { fontFamily: 'Inter_500Medium', fontSize: 13, textAlign: 'center' },
  cta:          { borderRadius: 10, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  ctaTxt:       { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 18, letterSpacing: 2 },
  // Confirm
  summCard:     { borderRadius: 12, borderWidth: 1, padding: 16, gap: 10 },
  summHead:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  summTitle:    { fontFamily: 'BarlowCondensed_700Bold', fontSize: 19 },
  divider:      { height: StyleSheet.hairlineWidth },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formGrid:     { flexDirection: 'row', gap: 10 },
  lbl:          { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.8, marginBottom: 5 },
  inp:          { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: 'Inter_400Regular', fontSize: 14 },
  inpMulti:     { height: 84, textAlignVertical: 'top', paddingTop: 11 },
  errBox:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, padding: 12 },
  errTxt:       { fontFamily: 'Inter_400Regular', fontSize: 12, flex: 1 },
  // Success
  successSection: { alignItems: 'center', paddingTop: 12, gap: 12 },
  successIcon:  { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  successTitle: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 32, letterSpacing: 1 },
  successSub:   { fontFamily: 'Inter_400Regular', fontSize: 15 },
});
