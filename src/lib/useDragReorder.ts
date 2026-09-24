import { useState } from 'react'

// リスト項目をドラッグ＆ドロップで並べ替える（つまみを掴んだときだけドラッグ可能にし、テキスト選択を妨げない）
export function useDragReorder<T>(setItems: React.Dispatch<React.SetStateAction<T[]>>) {
  const [armed, setArmed] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function reset() {
    setArmed(null)
    setDragIndex(null)
    setOverIndex(null)
  }

  function handleProps(i: number) {
    return {
      onMouseDown: () => setArmed(i),
      onMouseUp: () => setArmed(null),
    }
  }

  function itemProps(i: number) {
    return {
      draggable: armed === i,
      onDragStart: (e: React.DragEvent) => {
        setDragIndex(i)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(i))
      },
      onDragOver: (e: React.DragEvent) => {
        if (dragIndex === null) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (overIndex !== i) setOverIndex(i)
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        const from = dragIndex
        if (from !== null && from !== i) {
          setItems(prev => {
            const next = [...prev]
            const [moved] = next.splice(from, 1)
            next.splice(i, 0, moved)
            return next
          })
        }
        reset()
      },
      onDragEnd: reset,
    }
  }

  function itemClass(i: number) {
    if (dragIndex === i) return 'opacity-40'
    if (overIndex === i && dragIndex !== null) return 'ring-2 ring-indigo-400'
    return ''
  }

  return { handleProps, itemProps, itemClass }
}
