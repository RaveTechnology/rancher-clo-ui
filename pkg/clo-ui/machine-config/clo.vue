<script>
import CreateEditView from '@shell/mixins/create-edit-view';
import { LabeledInput } from '@components/Form/LabeledInput';
import LabeledSelect from '@shell/components/form/LabeledSelect';
import { Banner } from '@components/Banner';
import MachineForm from '../utils/machine-form.mjs';

export default {
  ...MachineForm,
  name: 'CloMachine',
  components: { LabeledInput, LabeledSelect, Banner },
  mixins: [CreateEditView],
  computed: {
    ...MachineForm.computed,
    networkOptions() {
      return ['private', 'public'].map((value) => ({ value, label: this.t(`driver.clo.network.${value}`) }));
    },
    sshOptions() {
      return ['private', 'public'].map((value) => ({ value, label: this.t(`driver.clo.ssh.${value}`) }));
    },
    numericFields() {
      return [{ key: 'vcpus', min: 1, max: 8 }, { key: 'ramGb', min: 1, max: 32 }, { key: 'bootGb', min: 10 }];
    },
  },
  methods: {
    ...MachineForm.methods,
    fieldMessage(key) {
      return this.fieldErrors[key] ? this.t(`driver.clo.validation.${this.fieldErrors[key]}`) : '';
    },
  },
};
</script>

<template>
  <div class="clo-machine">
    <template v-if="mode !== 'view'">
      <div class="clo-catalog-actions mb-20">
        <p
          role="status"
          aria-live="polite"
          class="text-muted"
        >
          {{ loading ? t('driver.clo.catalog.loading') : t('driver.clo.catalog.help') }}
        </p>
        <div>
          <button
            type="button"
            class="btn role-secondary"
            :disabled="busy || loading || manual"
            @click="refresh"
          >
            {{ t('driver.clo.catalog.refresh') }}
          </button>
          <button
            type="button"
            class="btn role-link"
            :aria-pressed="manual"
            :disabled="busy"
            @click="manual = !manual"
          >
            {{ t(manual ? 'driver.clo.catalog.useCatalog' : 'driver.clo.catalog.manual') }}
          </button>
        </div>
      </div>
      <Banner
        v-if="errorCode && !manual"
        color="warning"
        role="alert"
        :label="t(`driver.clo.errors.${errorCode}`)"
      />
    </template>

    <div class="row mb-20">
      <div class="col span-6">
        <LabeledInput
          v-if="manual || mode === 'view'"
          :value="value.projectId"
          label-key="driver.clo.fields.projectId"
          :mode="mode"
          :disabled="busy"
          :required="true"
          :status="fieldErrors.projectId ? 'error' : null"
          :sub-label="fieldMessage('projectId')"
          :aria-invalid="!!fieldErrors.projectId"
          @update:value="selectProject"
        />
        <LabeledSelect
          v-else
          :value="value.projectId"
          :options="projectOptions"
          label-key="driver.clo.fields.projectId"
          :mode="mode"
          :disabled="controlsDisabled"
          :required="true"
          :searchable="true"
          :status="fieldErrors.projectId ? 'error' : null"
          :tooltip="fieldMessage('projectId')"
          @update:value="selectProject"
        />
      </div>
      <div class="col span-6">
        <LabeledInput
          v-if="manual || mode === 'view'"
          v-model:value="value.imageId"
          label-key="driver.clo.fields.imageId"
          :mode="mode"
          :disabled="busy"
          :required="true"
          :status="fieldErrors.imageId ? 'error' : null"
          :sub-label="fieldMessage('imageId')"
          :aria-invalid="!!fieldErrors.imageId"
        />
        <LabeledSelect
          v-else
          v-model:value="value.imageId"
          :options="imageChoices"
          label-key="driver.clo.fields.imageId"
          :mode="mode"
          :disabled="controlsDisabled || !value.projectId"
          :required="true"
          :searchable="true"
          :status="fieldErrors.imageId ? 'error' : null"
          :tooltip="fieldMessage('imageId')"
        />
        <p class="text-muted mt-10">
          {{ t('driver.clo.imageHelp') }}
        </p>
      </div>
    </div>

    <div class="row mb-20">
      <div
        v-for="field in numericFields"
        :key="field.key"
        class="col span-4"
      >
        <LabeledInput
          v-model:value="value[field.key]"
          :label="t(`driver.clo.fields.${field.key}`)"
          type="integer"
          :min="field.min"
          :max="field.max"
          :mode="mode"
          :disabled="busy"
          :required="true"
          :status="fieldErrors[field.key] ? 'error' : null"
          :sub-label="fieldMessage(field.key)"
          :aria-invalid="!!fieldErrors[field.key]"
        />
      </div>
    </div>

    <h3>{{ t('driver.clo.network.title') }}</h3>
    <div class="row mb-20">
      <div class="col span-6">
        <LabeledSelect
          :value="networkMode"
          :options="networkOptions"
          label-key="driver.clo.network.profile"
          :mode="mode"
          :disabled="busy"
          @update:value="selectNetwork"
        />
        <p class="text-muted mt-10">
          {{ t(`driver.clo.network.${networkMode}Help`) }}
        </p>
      </div>
      <div
        v-if="networkMode === 'public'"
        class="col span-6"
      >
        <LabeledInput
          v-if="manual || mode === 'view'"
          v-model:value="value.publicIpId"
          label-key="driver.clo.fields.publicIpId"
          :mode="mode"
          :disabled="busy"
          :required="true"
          :status="fieldErrors.publicIpId ? 'error' : null"
          :sub-label="fieldMessage('publicIpId')"
          :aria-invalid="!!fieldErrors.publicIpId"
        />
        <LabeledSelect
          v-else
          v-model:value="value.publicIpId"
          :options="addressChoices"
          label-key="driver.clo.fields.publicIpId"
          :mode="mode"
          :disabled="controlsDisabled || !value.projectId"
          :required="true"
          :searchable="true"
          :status="fieldErrors.publicIpId ? 'error' : null"
          :tooltip="fieldMessage('publicIpId')"
        />
        <p class="text-muted mt-10">
          {{ t('driver.clo.network.addressHelp') }}
        </p>
      </div>
    </div>
    <Banner
      v-if="networkMode === 'public'"
      :color="fieldErrors.quantity || fieldErrors.publicIpId ? 'warning' : 'info'"
      :label="fieldErrors.quantity ? fieldMessage('quantity') : fieldErrors.publicIpId ? fieldMessage('publicIpId') : t('driver.clo.network.replacement')"
    />
    <div class="row mb-20">
      <div class="col span-6">
        <LabeledSelect
          v-model:value="value.sshAddress"
          :options="sshOptions"
          label-key="driver.clo.fields.sshAddress"
          :mode="mode"
          :disabled="busy"
          :status="fieldErrors.sshAddress ? 'error' : null"
          :tooltip="fieldMessage('sshAddress')"
        />
        <p class="text-muted mt-10">
          {{ t('driver.clo.ssh.help') }}
        </p>
      </div>
      <div class="col span-6">
        <LabeledInput
          v-model:value="value.timeoutSeconds"
          label-key="driver.clo.fields.timeoutSeconds"
          type="integer"
          :min="1"
          :max="3600"
          :mode="mode"
          :disabled="busy"
          :status="fieldErrors.timeoutSeconds ? 'error' : null"
          :sub-label="fieldMessage('timeoutSeconds')"
          :aria-invalid="!!fieldErrors.timeoutSeconds"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.clo-machine { container-type: inline-size; }
.clo-catalog-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between; }
.clo-catalog-actions p { margin: 0; }
@container (max-width: 600px) {
  .row { flex-direction: column; }
  .row > .col { width: 100%; margin-right: 0; }
  .row > .col + .col { margin-top: 1rem; }
}
</style>
