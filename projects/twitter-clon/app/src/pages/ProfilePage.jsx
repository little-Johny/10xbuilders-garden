import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { BrandLogo } from '../components/BrandLogo'
import { TweetCard } from '../components/TweetCard'
import { useAuth } from '../contexts/AuthContext'

export default function ProfilePage() {
  const { username } = useParams()
  const { session, profile: myProfile, ready, updateProfile } = useAuth()
  const navigate = useNavigate()

  const [profileData, setProfileData] = useState(null)
  const [tweets, setTweets] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const isOwn = myProfile?.username === username

  // Edición
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  // Avatar
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!username) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setNotFound(false)
      const res = await fetch(`/api/profiles/${username}`)
      const data = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setProfileData(data.profile)
      setTweets(data.tweets ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [username])

  function openEdit() {
    setEditName(profileData?.display_name ?? '')
    setEditBio(profileData?.bio ?? '')
    setEditError('')
    setAvatarPreview(null)
    setAvatarFile(null)
    setEditing(true)
  }

  function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSave(e) {
    e.preventDefault()
    setEditError('')
    setSaving(true)
    try {
      let updatedProfile = profileData

      // Subir avatar si hay uno nuevo
      if (avatarFile) {
        setUploadingAvatar(true)
        const formData = new FormData()
        formData.append('avatar', avatarFile)
        const res = await fetch('/api/profiles/me/avatar', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        })
        const data = await res.json().catch(() => ({}))
        setUploadingAvatar(false)
        if (!res.ok) throw new Error(data.error || 'Error al subir la foto')
        updatedProfile = { ...updatedProfile, ...data.profile }
      }

      // Actualizar nombre/bio si cambiaron
      const nameChanged = editName.trim() !== profileData?.display_name
      const bioChanged = editBio.trim() !== (profileData?.bio ?? '')
      if (nameChanged || bioChanged) {
        const body = {}
        if (nameChanged) body.display_name = editName.trim()
        if (bioChanged) body.bio = editBio.trim()
        const res = await fetch('/api/profiles/me', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Error al guardar')
        updatedProfile = { ...updatedProfile, ...data.profile }
      }

      setProfileData(updatedProfile)
      if (isOwn) updateProfile(updatedProfile)
      setEditing(false)
    } catch (err) {
      setEditError(err.message)
    } finally {
      setSaving(false)
      setUploadingAvatar(false)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-x-black text-x-text flex items-center justify-center">
        <BrandLogo className="h-10 w-10 animate-pulse text-x-text" />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-x-black text-x-text flex items-center justify-center">
        <BrandLogo className="h-10 w-10 animate-pulse text-x-text" />
      </div>
    )
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-x-black text-x-text flex flex-col items-center justify-center gap-4">
        <p className="text-[20px] font-bold">Esta cuenta no existe</p>
        <Link to="/" className="x-link text-[15px]">Volver al inicio</Link>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-x-black text-x-text">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-xline bg-x-black/80 backdrop-blur-md">
        <div className="mx-auto flex h-[53px] max-w-[600px] items-center gap-4 px-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-full p-2 hover:bg-x-hover transition"
            aria-label="Volver"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
              <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z" />
            </svg>
          </button>
          <div>
            <p className="text-[20px] font-bold leading-tight">
              {profileData?.display_name ?? username}
            </p>
            <p className="text-[13px] text-x-secondary">
              {tweets.length} posts
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[600px] border-x border-xline">
        {/* Banner placeholder */}
        <div className="h-[150px] bg-x-secondary/20" />

        {/* Avatar + botón editar */}
        <div className="px-4 pb-4">
          <div className="flex items-end justify-between -mt-12 mb-3">
            <Avatar
              src={profileData?.avatar_url}
              name={profileData?.display_name || username}
              size="xl"
              className="ring-4 ring-x-black"
            />
            {isOwn && !editing && (
              <button
                type="button"
                onClick={openEdit}
                className="rounded-full border border-xline px-4 py-1.5 text-[15px] font-bold text-x-text transition hover:bg-x-hover"
              >
                Editar perfil
              </button>
            )}
          </div>

          {/* Datos del perfil */}
          {editing ? (
            <form onSubmit={handleSave} className="flex flex-col gap-4 border border-xline rounded-xl p-4">
              {/* Cambiar avatar */}
              <div className="flex items-center gap-4">
                <Avatar
                  src={avatarPreview || profileData?.avatar_url}
                  name={editName || username}
                  size="lg"
                />
                <div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="x-btn-primary px-4 py-1.5 text-[14px]"
                  >
                    Cambiar foto
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={handleAvatarChange}
                    aria-label="Seleccionar foto de perfil"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="edit-display-name" className="block text-[13px] font-medium text-x-secondary mb-1">
                  Nombre
                </label>
                <input
                  id="edit-display-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={80}
                  className="x-input"
                />
              </div>

              <div>
                <label htmlFor="edit-bio" className="block text-[13px] font-medium text-x-secondary mb-1">
                  Biografía
                </label>
                <textarea
                  id="edit-bio"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  maxLength={160}
                  rows={3}
                  className="x-input resize-none"
                />
                <p className="mt-1 text-[13px] text-x-secondary text-right">{editBio.length}/160</p>
              </div>

              {editError && (
                <p className="text-[15px] text-red-500" role="alert">{editError}</p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-full border border-xline px-4 py-1.5 text-[15px] font-bold text-x-text transition hover:bg-x-hover"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="x-btn-primary px-4 py-1.5 text-[15px] disabled:opacity-40"
                >
                  {uploadingAvatar ? 'Subiendo foto…' : saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <p className="text-[20px] font-bold leading-tight">
                {profileData?.display_name}
              </p>
              <p className="text-[15px] text-x-secondary mb-2">@{profileData?.username}</p>
              {profileData?.bio && (
                <p className="text-[15px] text-x-text whitespace-pre-wrap">{profileData.bio}</p>
              )}
            </div>
          )}
        </div>

        {/* Tweets del perfil */}
        <div className="border-t border-xline">
          <p className="px-4 py-2 text-[15px] font-bold border-b border-xline">Posts</p>
          {tweets.length === 0 ? (
            <p className="px-4 py-8 text-center text-[15px] text-x-secondary">
              {isOwn ? 'Aún no has publicado nada.' : 'Este usuario no ha publicado nada.'}
            </p>
          ) : (
            <ul>
              {tweets.map((tweet) => (
                <TweetCard key={tweet.id} tweet={tweet} />
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
