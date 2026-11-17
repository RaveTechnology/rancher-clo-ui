<script>
import CreateEditView from '@shell/mixins/create-edit-view';
import { LabeledInput } from '@components/Form/LabeledInput';
import { Banner } from '@components/Banner';
import CredentialForm from '../utils/credential-form.mjs';

export default {
  ...CredentialForm,
  name: 'CloCredential',
  components: { LabeledInput, Banner },
  mixins: [CreateEditView],
  data() {
    return { ...CredentialForm.data.call(this), showToken: false };
  },
};
</script>

<template>
  <div class="clo-credential">
    <Banner
      v-if="mode === 'view'"
      color="info"
      label-key="driver.clo.credential.saved"
    />
    <template v-else>
      <LabeledInput
        id="clo-api-token"
        v-model:value="draftToken"
        label-key="driver.clo.credential.token"
        :type="showToken ? 'text' : 'password'"
        :mode="mode"
        :disabled="checking"
        :required="!value.id"
        :status="errorCode ? 'error' : null"
        :aria-invalid="!!errorCode"
        aria-describedby="clo-token-help"
      >
        <template #suffix>
          <button
            type="button"
            class="btn role-link"
            :aria-pressed="showToken"
            aria-controls="clo-api-token"
            @click="showToken = !showToken"
          >
            {{ t(showToken ? 'driver.clo.credential.hide' : 'driver.clo.credential.show') }}
          </button>
        </template>
      </LabeledInput>
      <p
        id="clo-token-help"
        class="text-muted mt-10"
      >
        {{ t(value.id ? 'driver.clo.credential.keep' : 'driver.clo.credential.help') }}
      </p>
      <Banner
        v-if="errorCode"
        color="error"
        role="alert"
        :label="t(`driver.clo.errors.${errorCode}`)"
      />
      <p
        role="status"
        aria-live="polite"
      >
        {{ checking ? t('driver.clo.credential.checking') : '' }}
      </p>
    </template>
  </div>
</template>
