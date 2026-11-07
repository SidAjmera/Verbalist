import Image from 'next/image';
export function ProfileAvatar({
  name,
  url,
  large = false,
}: {
  name: string;
  url?: string | null;
  large?: boolean;
}) {
  return (
    <span className={`avatar overflow-hidden ${large ? 'size-14! text-xl' : ''}`}>
      {url ? (
        <Image
          src={url}
          alt={`${name}'s profile`}
          width={large ? 56 : 36}
          height={large ? 56 : 36}
          unoptimized
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
