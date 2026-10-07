import Team from '../pages/Team'
import { useAuth } from './AuthProvider'
import AuthGate from './AuthGate'
import MyAssignedTasks from './MyAssignedTasks'

function TeamForRole(): React.JSX.Element {
  const { state, localOnly } = useAuth()
  const isPlainMember = !localOnly && state?.signedIn && state.organization?.role === 'member'
  return isPlainMember ? <MyAssignedTasks /> : <Team />
}

export default function TeamRoute(): React.JSX.Element {
  return (
    <AuthGate>
      <TeamForRole />
    </AuthGate>
  )
}
