import { useLocalSearchParams } from 'expo-router';
import { AuthForm } from '@/components/AuthForm';

export default function LoginScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  return <AuthForm mode="login" reason={reason} />;
}
