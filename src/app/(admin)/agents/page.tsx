"use client";

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Agent = {
  id: string
  name: string
  description?: string
  systemPrompt?: string
}

const initialForm: Omit<Agent, 'id'> = {
  name: '',
  description: '',
  systemPrompt: '',
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<Omit<Agent, 'id'>>(() => initialForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)

  useEffect(() => {
    refreshAgents()
  }, [])

  const formTitle = useMemo(() => (editingId ? 'Edit Agent' : 'New Agent'), [editingId])

  async function refreshAgents() {
    setLoading(true)
    try {
      const response = await fetch('/api/agents')
      const data = await response.json()
      setAgents(data)
    } catch (error) {
      console.error(error)
      setAgents([])
    } finally {
      setLoading(false)
    }
  }

  async function saveAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)

    const payload = {
      ...form,
      ...(editingId ? { id: editingId } : {}),
    }

    try {
      const response = await fetch('/api/agents', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error('Unable to save agent')
      }
      await refreshAgents()
      resetForm()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  function editAgent(agent: Agent) {
    setEditingId(agent.id)
    setForm({
      name: agent.name,
      description: agent.description ?? '',
      systemPrompt: agent.systemPrompt ?? '',
    })
    setIsFormOpen(true)
  }

  async function deleteAgent(id: string) {
    if (!window.confirm('Delete this agent?')) {
      return
    }
    setLoading(true)
    try {
      await fetch(`/api/agents?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      await refreshAgents()
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setEditingId(null)
    setForm(initialForm)
    setIsFormOpen(false)
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Agents Management</h2>
          <p className="text-sm text-slate-400">Create and manage your local assistant agents.</p>
        </div>
        <Button onClick={() => setIsFormOpen(true)}>{editingId ? 'Continue editing' : 'New Agent'}</Button>
      </div>

      {isFormOpen && (
        <section className="mb-8 rounded-3xl border border-slate-700 bg-slate-950 p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">{formTitle}</h3>
              <p className="text-sm text-slate-400">Add or update your agent definition, then save it to the database.</p>
            </div>
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>

          <form className="grid gap-4" onSubmit={saveAgent}>
            <label className="grid gap-2 text-sm text-slate-200">
              Agent Name
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Asistente IA"
                required
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              Description
              <Textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Brief description of the agent"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-200">
              System Prompt
              <Textarea
                value={form.systemPrompt}
                onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })}
                placeholder="You are a local AI assistant for managing files and code."
              />
            </label>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {editingId ? 'Update Agent' : 'Create Agent'}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>Clear</Button>
            </div>
          </form>
        </section>
      )}

      <div className="space-y-4">
        {agents.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700 p-8 text-center text-slate-400">
            {loading ? 'Loading agents...' : 'No agents found yet.'}
          </div>
        ) : (
          agents.map((agent) => (
            <div key={agent.id} className="rounded-3xl border border-slate-700 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">{agent.name}</div>
                  <div className="mt-1 text-sm text-slate-400">{agent.description || 'No description provided.'}</div>
                  <div className="mt-3 whitespace-pre-line rounded-2xl bg-slate-900/80 p-4 text-sm text-slate-300">
                    {agent.systemPrompt || 'No system prompt provided.'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => editAgent(agent)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteAgent(agent.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
