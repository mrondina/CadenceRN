import React from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { UnsupportedCardFormatError } from '@/domain/types';

interface Props {
  children: React.ReactNode;
  onSkip: () => void;
  // Reset key — mount a new boundary instance when the card changes.
  // Pass entry.item.id here so the boundary clears on every card advance.
}

interface State {
  error: Error | null;
}

export class SessionErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (error instanceof UnsupportedCardFormatError) {
      // Expected — sequence cards are Phase 2. Log for analytics (Phase 2 wiring).
      console.warn('[SessionErrorBoundary] Unsupported card format skipped:', error.format);
    } else {
      console.error('[SessionErrorBoundary] Unexpected render error:', error, info);
    }
  }

  render() {
    if (this.state.error) {
      const isUnsupported = this.state.error instanceof UnsupportedCardFormatError;
      return (
        <SkipCard
          message={
            isUnsupported
              ? 'This card type isn\'t available yet — it\'ll be skipped.'
              : 'Something went wrong loading this card.'
          }
          onSkip={this.props.onSkip}
        />
      );
    }
    return this.props.children;
  }
}

function SkipCard({ message, onSkip }: { message: string; onSkip: () => void }) {
  return (
    <View style={{ gap: 16 }}>
      <AppCard variant="alt">
        <AppText variant="body" color="inkMuted">{message}</AppText>
      </AppCard>
      <AppButton label="Skip" onPress={onSkip} variant="secondary" fullWidth />
    </View>
  );
}
