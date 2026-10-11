import type {Metadata} from 'next';
import StaffAuthForm from '../_components/auth-form';
export const metadata: Metadata={title:'職員ログイン | MIRAI OS'};
export default function StaffLoginPage() {
 return <StaffAuthForm mode="login" />;
}
