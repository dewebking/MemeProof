import TokenPassport from "../../../token-passport";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TokenPassport key={id} id={id} />;
}
