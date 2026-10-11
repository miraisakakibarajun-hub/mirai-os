import type {Metadata} from 'next';
import StaffAuthForm from '../../_components/auth-form';
export const metadata: Metadata={title:'パスワード変更 | MIRAI OS'};
export default function StaffPasswordChangePage() {
 return <StaffAuthForm mode="change" />;
}
