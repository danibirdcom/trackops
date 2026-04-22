import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from '@/routes/Home'
import Project from '@/routes/Project'
import SharedView from '@/routes/SharedView'
import VolunteerSearch from '@/routes/VolunteerSearch'
import VolunteerView from '@/routes/VolunteerView'
import { useUiStore } from '@/stores/uiStore'

export default function App() {
  const darkMode = useUiStore((s) => s.darkMode)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/project/:id" element={<Project />} />
      <Route path="/volunteer/:projectId" element={<VolunteerSearch />} />
      <Route path="/volunteer/:projectId/:volunteerId" element={<VolunteerView />} />
      <Route path="/share" element={<SharedView />} />
      <Route path="/project/:id/share/:token" element={<SharedView />} />
    </Routes>
  )
}
