import { redirect } from 'next/navigation'

// Superadmins and org admins now share one login; the role decides where you land.
export default function AdminLoginRedirect() {
  redirect('/login')
}
