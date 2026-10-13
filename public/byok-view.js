const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const details=(label,value)=>`<details><summary>${escape(label)}</summary><pre>${escape(JSON.stringify(value,null,2))}</pre></details>`;
const messages={
  BYOK_OUTPUT_TRUNCATED:'La génération a atteint sa limite avant de terminer la réponse. Aucun résultat partiel n’est présenté comme une explication.',
  BYOK_EMPTY_RESPONSE:'Le fournisseur a renvoyé une réponse sans texte exploitable.',
  BYOK_EMPTY_INTERPRETATION:'La réponse ne contient aucune explication sourcée. Le parcours reste à vérifier.',
  BYOK_ANSWER_REJECTED:'La réponse ne respecte pas le format ou les références exigés. Elle n’a pas été retenue.',
  BYOK_INVALID_JSON:'La réponse reçue ne contient pas un JSON lisible et complet.',
  BYOK_HTTP_429:'Le fournisseur limite actuellement les requêtes. Vous pouvez réessayer plus tard.',
  BYOK_HTTP_401:'La clé a été refusée. Vérifiez sa configuration locale.',
  BYOK_HTTP_403:'L’accès a été refusé par le fournisseur.',
  BYOK_HTTP_400:'Le fournisseur refuse les paramètres demandés. Vérifiez la compatibilité du modèle.',
  BYOK_REASONING_REQUIRED:'Ce modèle impose le raisonnement. Sélectionnez un modèle compatible avec une explication sans raisonnement prolongé.',
  BYOK_CANCELLED_OR_TIMEOUT:'La requête a été annulée ou a dépassé le délai. Son coût peut rester inconnu.',
  BYOK_BUDGET_EXHAUSTED:'Le budget disponible ou le plafond par requête ne permet pas cet appel.',
  BYOK_PROVIDER_CAP_REQUIRED:'Le plafond de la clé OpenRouter ne permet pas cet appel.',
  BYOK_CONTENT_FILTERED:'Le fournisseur a interrompu la réponse avec son filtre de contenu.',
  BYOK_INTERRUPTED:'La requête précédente a été interrompue. Son résultat et son coût restent incertains.'
};
const reasons={ROOT_FIELDS:'Champs principaux incorrects.',ITEM_LIMIT:'Liste absente ou trop longue.',ITEM_FIELDS:'Champs d’une affirmation incorrects.',TEXT_LIMIT:'Texte vide ou trop long.',CITATIONS_REQUIRED:'Référence absente ou trop de références.',UNKNOWN_CITATION:'Une référence ne fait pas partie du contexte autorisé.',UNKNOWNS_FORMAT:'Format des informations manquantes incorrect.'};
export function renderByokPreview(preview) {
  const p=preview.packet,s=p.selection;
  return `<h3>Contexte à envoyer</h3><p>${escape(preview.model)} · ${p.evidence.length} fichiers sélectionnés${s?` sur ${s.eligible} ; ${s.omitted} non transmis`:''}.</p><p>${p.includeSource?'Descriptions de code et extraits des documents sélectionnés inclus.':'Descriptions de code exclues : seule la structure est fournie.'} ${p.includeMemory?'Contexte Core borné inclus selon disponibilité.':'Mémoire Core exclue.'}</p><p>Limite de sortie : ${escape(preview.requestPolicy?.maxTokens)} tokens. Raisonnement désactivé si pris en charge. Aucun nouvel essai automatique.</p><ul>${p.evidence.map(e=>`<li>${escape(e.citation)} — ${escape(e.path)}</li>`).join('')}</ul><p>Cette sélection est partielle. Une relation statique ne prouve pas une exécution.</p>${preview.retryOf?'<p>Nouvel essai explicite : un nouvel appel peut être facturé. Vérifiez le contexte avant de l’envoyer.</p>':''}${details('Voir exactement le contenu transmis',p)}`;
}
export function renderByokResult(result) {
  const cost=result.reportedCostUsd==null?'Coût réel inconnu ; réservation conservée.':`Coût déclaré : ${result.reportedCostUsd.toFixed(8)} USD.`;
  const meta=`<p>${escape(cost)} Durée : ${((result.latencyMs||0)/1000).toFixed(1)} s.${result.cached?' Résultat déjà enregistré ; aucun nouvel appel.':''}</p>`;
  if(result.status!=='INTERPRETATION')return `<h3>Explication indisponible</h3><p>${escape(messages[result.code]||'La requête n’a pas abouti. Les observations locales restent disponibles.')}</p>${result.diagnostics?.validationReason?`<p>${escape(reasons[result.diagnostics.validationReason]||'Format non conforme.')}</p>`:''}${meta}<p>Aucun nouvel appel ne sera lancé automatiquement.</p>${details('Diagnostic technique (sans clé ni réponse brute)',result)}`;
  const sourceMap=new Map(result.evidence.map(e=>[e.citation,e]));
  const section=(title,items)=>items.length?`<h3>${title}</h3><ul>${items.map(i=>`<li><p>${escape(i.text)}</p>${i.citations.map(c=>{const e=sourceMap.get(c);return e?.path?`<button type="button" data-ai-source="${escape(e.path)}" data-ai-snapshot="${escape(e.snapshotId)}">${escape(c)} · ${escape(e.path)}</button>`:`<span>${escape(c)} · ${escape(e?.id||'source enregistrée')}</span>`;}).join(' ')}</li>`).join('')}</ul>`:'';
  return `<h3>Explication à relire</h3><p>Interprétation du contexte sélectionné. Les tests, la preuve et votre compréhension ne sont pas validés par cette réponse.</p>${section('Ce que les sources permettent de comprendre',result.answer.claims)}${section('Vérifications proposées — non exécutées',result.answer.nextTests)}${result.answer.unknowns.length?`<h3>Limites et informations manquantes</h3><ul>${result.answer.unknowns.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>`:''}${meta}<pre id="aiSourceDetail" hidden></pre>${details('Détails techniques et traçabilité',result)}`;
}
export function formatByokStatus(s) {
  if(s.status==='CONNECTED')return `Connexion vérifiée sans génération ni envoi du projet. Modèle disponible : ${s.modelAvailable?'oui':'non'}. Format structuré : ${s.structuredOutputAvailable?'oui':'non'}. Plafond de la clé acceptable : ${s.providerCapAcceptable?'oui':'non'}.`;
  if(s.status==='UNAVAILABLE')return messages[s.code]||'Connexion indisponible.';
  return s.configured?`${s.model} · plafond total ${s.budgetUsd} USD · maximum ${s.maxRequestUsd} USD par requête · ${s.maxTokens} tokens. Consommation déclarée et réservations : ${s.reservedUsd} USD. Aucun appel automatique.`:'Configurez une clé dédiée et plafonnée depuis la CLI. Aucune clé n’est saisie dans cette page.';
}
