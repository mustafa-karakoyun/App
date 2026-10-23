import { useLocalSearchParams } from 'expo-router';
import { AuthForm } from '@/components/AuthForm';

export default function RegisterScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  return <AuthForm mode="register" reason={reason} />;
}
