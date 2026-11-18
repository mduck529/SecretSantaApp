import Image, { type StaticImageData } from "next/image";

/** The family photo as a taped-on snapshot. Renders nothing until a photo is configured. */
export function FamilyPhoto({ photo }: { photo: { image: StaticImageData; caption: string } | null }) {
  if (!photo) return null;
  return (
    <figure className="snapshot">
      <Image src={photo.image} alt="Our family" placeholder="blur" sizes="(max-width: 46rem) 92vw, 40rem" priority />
      {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
    </figure>
  );
}
