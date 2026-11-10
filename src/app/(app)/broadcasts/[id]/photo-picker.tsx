"use client"

import { CropIcon, ImagePlusIcon, UploadIcon } from "lucide-react"
import { useId, useRef, useState } from "react"
import Cropper from "react-easy-crop"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ASPECTS, type ImageBlock } from "@/lib/broadcasts/blocks"
import type { CropArea } from "@/lib/broadcasts/photo-upload"
import { EMAIL_PHOTOS } from "@/lib/broadcasts/photos"

import { cropPhoto, uploadPhoto } from "../actions"

type PhotoFields = Pick<ImageBlock, "source" | "src" | "alt" | "aspect" | "area">

const MAX_PHOTO_EDGE = 2400

// Phone photos are often over the upload limit, so they're shrunk before leaving the browser.
async function shrinkPhoto(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read photo"))), "image/jpeg", 0.9)
  })
}

function CropDialog({
  photo,
  onClose,
  onApply,
}: {
  photo: PhotoFields
  onClose: () => void
  onApply: (fields: Pick<PhotoFields, "src" | "aspect" | "area">) => void
}) {
  const [aspect, setAspect] = useState(photo.aspect)
  const [natural, setNatural] = useState<number | null>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<CropArea | null>(photo.area)
  const [isSaving, setIsSaving] = useState(false)
  const ratio = ASPECTS.find((item) => item.key === aspect)?.ratio ?? natural ?? 3 / 2

  async function apply() {
    if (!area) return
    setIsSaving(true)
    const result = await cropPhoto({ source: photo.source, area })
    setIsSaving(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onApply({ src: result.src, aspect, area })
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recenter photo</DialogTitle>
          <DialogDescription>Drag the photo to frame it, and zoom in to crop tighter.</DialogDescription>
        </DialogHeader>
        <div className="relative h-80 overflow-hidden rounded-lg bg-muted">
          <Cropper
            image={photo.source}
            crop={position}
            zoom={zoom}
            aspect={ratio}
            maxZoom={4}
            initialCroppedAreaPercentages={photo.area ?? undefined}
            onCropChange={setPosition}
            onZoomChange={setZoom}
            onCropComplete={(percent) => setArea(percent)}
            onMediaLoaded={(media) => setNatural(media.naturalWidth / media.naturalHeight)}
          />
        </div>
        <Field>
          <FieldLabel>Shape</FieldLabel>
          <ToggleGroup
            variant="outline"
            aria-label="Photo shape"
            value={[aspect]}
            onValueChange={(value: string[]) => value[0] && setAspect(value[0])}
          >
            {ASPECTS.map((item) => (
              <ToggleGroupItem key={item.key} value={item.key}>
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field>
          <FieldLabel>Zoom</FieldLabel>
          <Slider
            aria-label="Zoom"
            min={1}
            max={4}
            step={0.05}
            value={[zoom]}
            onValueChange={(value) => setZoom(Array.isArray(value) ? value[0] : value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={isSaving || !area}>
            {isSaving && <Spinner data-icon="inline-start" />}
            Use this crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LibraryDialog({ onClose, onChoose }: { onClose: () => void; onChoose: (photo: (typeof EMAIL_PHOTOS)[number]) => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Photo library</DialogTitle>
          <DialogDescription>Your own photos from Tanzania. You can recenter any of them after choosing.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60svh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {EMAIL_PHOTOS.map((photo) => (
            <Button
              key={photo.path}
              variant="outline"
              className="h-auto flex-col items-start gap-1 rounded-lg p-1 whitespace-normal"
              onClick={() => {
                onChoose(photo)
                onClose()
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static thumbnails, same files the email uses */}
              <img src={photo.path} alt={photo.alt} className="aspect-[12/5] w-full rounded-md object-cover" />
              <span className="px-1 pb-1 text-left text-xs font-normal">{photo.label}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function PhotoPicker({
  photo,
  onChange,
  disabled,
}: {
  photo: PhotoFields
  onChange: (fields: Partial<PhotoFields>) => void
  disabled?: boolean
}) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dialog, setDialog] = useState<"crop" | "library" | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const altId = useId()

  async function upload(file: File | undefined) {
    if (!file) return
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.set("photo", await shrinkPhoto(file), "photo.jpg")
      const result = await uploadPhoto(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onChange({ source: result.source, src: result.src, alt: "", aspect: "original", area: null })
      setDialog("crop")
    } catch {
      toast.error("Couldn't read that file. Try a JPG or PNG.")
    } finally {
      if (input.current) input.current.value = ""
      setIsUploading(false)
    }
  }

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      className="sr-only"
      aria-label="Upload a photo"
      tabIndex={-1}
      disabled={disabled || isUploading}
      onChange={(event) => upload(event.target.files?.[0])}
    />
  )

  return (
    <div
      className={isDragging ? "flex flex-col gap-3 rounded-md outline-2 outline-primary" : "flex flex-col gap-3"}
      onDragOver={(event) => {
        if (disabled) return
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        if (disabled) return
        event.preventDefault()
        setIsDragging(false)
        upload(event.dataTransfer.files[0])
      }}
    >
      {fileInput}
      {photo.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- shows the exact file the email will load
        <img src={photo.src} alt={photo.alt} className="max-h-44 w-full rounded-md border object-contain" />
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">{isUploading ? <Spinner /> : <ImagePlusIcon />}</EmptyMedia>
            <EmptyTitle>{isUploading ? "Uploading..." : "Drop a photo here"}</EmptyTitle>
            <EmptyDescription>Or use the buttons below.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={isUploading} onClick={() => input.current?.click()}>
            {isUploading ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
            {photo.src ? "Replace" : "Upload"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDialog("library")}>
            Library
          </Button>
          {photo.source && (
            <Button variant="outline" size="sm" onClick={() => setDialog("crop")}>
              <CropIcon data-icon="inline-start" />
              Recenter
            </Button>
          )}
        </div>
      )}
      {photo.src && (
        <Field>
          <FieldLabel htmlFor={altId}>Photo description</FieldLabel>
          <Input
            id={altId}
            value={photo.alt}
            placeholder="Elephants crossing a dry riverbed"
            disabled={disabled}
            onChange={(event) => onChange({ alt: event.target.value })}
          />
          <FieldDescription>Shown when images are off, and read aloud by screen readers.</FieldDescription>
        </Field>
      )}
      {dialog === "crop" && <CropDialog photo={photo} onClose={() => setDialog(null)} onApply={onChange} />}
      {dialog === "library" && (
        <LibraryDialog
          onClose={() => setDialog(null)}
          onChoose={(choice) =>
            onChange({ source: choice.original, src: choice.path, alt: choice.alt, aspect: "wide", area: null })
          }
        />
      )}
    </div>
  )
}
