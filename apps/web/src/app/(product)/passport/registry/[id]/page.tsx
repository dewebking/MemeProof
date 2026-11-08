import { RegistryPassportDetail } from "../../../../registry-passports";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RegistryPassportDetail tokenRecordId={id} />;
}
