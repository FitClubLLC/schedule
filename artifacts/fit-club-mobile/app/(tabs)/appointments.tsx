import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGetPastAppointments, useGetUpcomingAppointments } from '@workspace/api-client-react';
import SvgIcon from '@/components/SvgIcon';
import AppointmentCard from '@/components/AppointmentCard';
import RescheduleModal from '@/components/RescheduleModal';
import { useAppointmentActions } from '@/hooks/useAppointmentActions';
import { useAppForegroundRefresh } from '@/hooks/useAppForegroundRefresh';
import { friendlyError } from '@/lib/friendlyError';

type Tab = 'upcoming' | 'past';

export default function AppointmentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('upcoming');
  const [rescheduleTarget, setRescheduleTarget] = useState<{ id: number; type: string } | null>(null);
  const { cancelAppointment } = useAppointmentActions();

  const upcomingQuery = useGetUpcomingAppointments({
    query: { enabled: activeTab === 'upcoming' },
  });
  const pastQuery = useGetPastAppointments({
    query: { enabled: activeTab === 'past' },
  });

  // Refetch when the user returns from an external browser (e.g. after booking in Acuity)
  useAppForegroundRefresh([['/api/appointments/upcoming'], ['/api/appointments/past']]);

  const query = activeTab === 'upcoming' ? upcomingQuery : pastQuery;
  const appointments = query.data ?? [];
  const isLoading = query.isLoading;
  const isError = query.isError;
  const isRefreshing = query.isFetching && !query.isLoading;

  function handleCancel(id: number) {
    Alert.alert(
      'Cancel Session',
      'Are you sure you want to cancel this session?\n\nSessions cancelled with less than 24 hours\u2019 notice may still be deducted from your membership.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel session',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelAppointment(id);
              Alert.alert(
                'Session Cancelled',
                'Your session has been cancelled. If more than 24 hours remained, your credit has been returned to your membership.',
              );
            } catch (err: any) {
              Alert.alert('Could not cancel', friendlyError(err));
            }
          },
        },
      ],
    );
  }

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 16,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>SESSIONS</Text>

        {/* Tab toggle */}
        <View style={[styles.toggleContainer, { backgroundColor: colors.muted }]}>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              activeTab === 'upcoming' && {
                backgroundColor: colors.primary,
              },
            ]}
            onPress={() => setActiveTab('upcoming')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.toggleText,
                {
                  color:
                    activeTab === 'upcoming' ? colors.primaryForeground : colors.mutedForeground,
                },
              ]}
            >
              UPCOMING
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              activeTab === 'past' && {
                backgroundColor: colors.card,
              },
            ]}
            onPress={() => setActiveTab('past')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.toggleText,
                {
                  color:
                    activeTab === 'past' ? colors.foreground : colors.mutedForeground,
                },
              ]}
            >
              PAST
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <SvgIcon name="alert-circle" size={32} color={colors.destructive} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, marginTop: 12 }]}>
            Could not load sessions
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, textAlign: 'center', paddingHorizontal: 32 }]}>
            {friendlyError(query.error)}
          </Text>
          <TouchableOpacity
            onPress={() => query.refetch()}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.8}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <AppointmentCard
              appointment={item}
              onReschedule={activeTab === 'upcoming' ? () => setRescheduleTarget({ id: item.id, type: item.type }) : undefined}
              onCancel={activeTab === 'upcoming' ? () => handleCancel(item.id) : undefined}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            appointments.length === 0 && styles.emptyContainer,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!appointments.length}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => query.refetch()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyInner}>
              <SvgIcon
                name={activeTab === 'upcoming' ? 'calendar' : 'clock'}
                size={40}
                color={colors.mutedForeground}
              />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {activeTab === 'upcoming' ? 'No upcoming sessions' : 'No past sessions'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                {activeTab === 'upcoming'
                  ? 'Tap Book to schedule your next session'
                  : 'Your completed sessions will appear here'}
              </Text>
            </View>
          }
        />
      )}

      {/* Reschedule modal */}
      {rescheduleTarget && (
        <RescheduleModal
          visible={!!rescheduleTarget}
          appointmentId={rescheduleTarget.id}
          appointmentType={rescheduleTarget.type}
          onClose={() => setRescheduleTarget(null)}
          onSuccess={() => setRescheduleTarget(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 28,
    letterSpacing: 2,
    marginBottom: 14,
  },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 13,
    letterSpacing: 1.5,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyInner: {
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 22,
    letterSpacing: 1,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  retryText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: 14,
    letterSpacing: 1.5,
  },
});
