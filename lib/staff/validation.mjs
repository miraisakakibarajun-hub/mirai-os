const nonblank = v => typeof v === 'string' && /\S/u.test(v);
export function validateCandidate(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['入力形式が不正です。'];
  const keys = ['name', 'legacyNumber', 'affiliations', 'roles'];
  if (Object.keys(value).some(k => !keys.includes(k))) errors.push('未対応の入力項目があります。');
  if (!nonblank(value.name)) errors.push('氏名を入力してください。');
  if (typeof value.legacyNumber !== 'string') errors.push('旧職員番号は文字列で入力してください。');
  else if (value.legacyNumber !== '' && !nonblank(value.legacyNumber)) errors.push('旧職員番号が空白だけになっています。');
  for (const key of ['affiliations', 'roles']) {
    if (!Array.isArray(value[key]) || value[key].some(v => !nonblank(v))) errors.push('所属・役割の入力形式を確認してください。');
  }
  return errors;
}
export function toReceivedItems(value) {
  const errors = validateCandidate(value);
  if (errors.length) throw new Error(errors.join('\n'));
  return [
    {kind: 'PERSON_NAME', value: value.name},
    ...(value.legacyNumber === '' ? [] : [{kind: 'LEGACY_IDENTIFIER', value: value.legacyNumber}]),
    ...value.affiliations.map(value => ({kind: 'AFFILIATION_LABEL', value})),
    ...value.roles.map(value => ({kind: 'BUSINESS_ROLE_LABEL', value})),
  ];
}
