import React from 'react';
import { Linking, Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import SvgIcon from '@/components/SvgIcon';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MEMBERSHIPS_URL = 'https://app.acuityscheduling.com/catalog.php?owner=36930698';
function openMemberships() { Linking.openURL(MEMBERSHIPS_URL); }

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="appointments">
        <Icon sf={{ default: 'calendar', selected: 'calendar.circle.fill' }} />
        <Label>Sessions</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="book">
        <Icon sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }} />
        <Label>Book</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="memberships">
        <Icon sf={{ default: 'creditcard', selected: 'creditcard.fill' }} />
        <Label>Memberships</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.card },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <SvgIcon name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: 'Sessions',
          tabBarLabel: 'Sessions',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="calendar" tintColor={color} size={24} />
            ) : (
              <SvgIcon name="calendar" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarLabel: 'Book',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="plus.circle" tintColor={color} size={24} />
            ) : (
              <SvgIcon name="plus-circle" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="memberships"
        options={{
          title: 'Memberships',
          tabBarLabel: 'Memberships',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="creditcard" tintColor={color} size={24} />
            ) : (
              <SvgIcon name="credit-card" size={22} color={color} />
            ),
          tabBarButton: ({ href: _href, onPress: _defaultOnPress, ref: _ref, style, ...props }) => (
            <Pressable
              {...props}
              onPress={openMemberships}
              style={({ pressed }) => [
                style,
                pressed && { opacity: 0.7 },
              ]}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person" tintColor={color} size={24} />
            ) : (
              <SvgIcon name="user" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
