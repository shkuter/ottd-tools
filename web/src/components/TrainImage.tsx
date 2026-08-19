import { Image } from '@mantine/core';

/**
 * Vehicle sprite: from the Iron Horse docs, or from the OpenGFX2 Classic base
 * set for vanilla vehicles. Hidden when there is no image for the model.
 */
export function TrainImage({ trainId }: { trainId: string }) {
  const dir = trainId.startsWith('vanilla_') ? 'vanilla_trains' : 'trains';
  return (
    <Image
      className="train-sprite"
      src={`${import.meta.env.BASE_URL}icons/${dir}/${trainId}.png`}
      alt=""
      loading="lazy"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}
