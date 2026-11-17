import { createCatalog, Generation, isUUID, safeError } from './catalog.mjs';
import { defaults, validateConfig, imageOptions, addressOptions } from './config.mjs';

export default {
  emits: ['validationChanged'],
  props: {
    value: { type: Object, required: true },
    mode: { type: String, default: 'edit' },
    credentialId: { type: String, default: '' },
    busy: { type: Boolean, default: false },
    poolIndex: { type: Number, default: 0 },
    poolCreateMode: { type: Boolean, default: false },
    machinePools: { type: Array, default: () => [] },
  },
  data() {
    return {
      projects: [], images: [], addresses: [], loading: false, errorCode: '', manual: false,
      networkMode: this.value.publicIpId ? 'public' : 'private',
      generation: new Generation(),
    };
  },
  computed: {
    fieldErrors() {
      const errors = validateConfig(this.value, this.poolIndex, this.machinePools);

      if (this.networkMode === 'public' && !this.value.publicIpId) {
        errors.publicIpId = 'required';
      }

      return errors;
    },
    valid() {
      return this.mode === 'view' || !!this.credentialId &&
        (this.manual || !this.loading && !this.errorCode) && Object.keys(this.fieldErrors).length === 0;
    },
    projectOptions() {
      const choices = this.projects.filter((item) => item.status === 'ACTIVE' || item.id === this.value.projectId)
        .map((item) => ({ value: item.id, label: item.display_name || item.name || item.id }));

      if (this.value.projectId && !choices.some((item) => item.value === this.value.projectId)) {
        choices.push({ value: this.value.projectId, label: this.value.projectId });
      }

      return choices;
    },
    imageChoices() { return imageOptions(this.images, this.value.imageId); },
    addressChoices() {
      return addressOptions(this.addresses, this.value.publicIpId).map((item) => ({
        ...item,
        label: item.inUse ? `${ item.label } (${ this.t('driver.clo.inUse') })` : item.label,
      }));
    },
    controlsDisabled() { return this.busy || this.mode === 'view' || !this.manual && this.loading; },
  },
  watch: {
    credentialId() { this.refresh(); },
    'value.projectId'() { this.refresh(); },
    'value.publicIpId'(value) { this.networkMode = value ? 'public' : 'private'; },
    manual() { this.refresh(); },
    valid: {
      immediate: true,
      handler(value) { this.$emit('validationChanged', value); },
    },
  },
  created() {
    if (this.mode === 'create' || this.poolCreateMode) {
      Object.assign(this.value, defaults(this.value, 'create'));
    }
    this.refresh();
  },
  beforeUnmount() { this.generation.invalidate(); },
  methods: {
    async refresh() {
      const ticket = this.generation.next();
      const isCurrent = () => this.generation.isCurrent(ticket);

      if (this.mode === 'view' || this.manual) {
        this.loading = false;

        return;
      }
      this.projects = [];
      this.images = [];
      this.addresses = [];
      this.errorCode = '';
      if (!this.credentialId) {
        this.errorCode = 'credentialRequired';

        return;
      }
      this.loading = true;
      try {
        const project = this.value.projectId;
        const client = createCatalog(this.$shell.proxy, { id: this.credentialId }, { isCurrent });
        const projects = await client.projects();
        let images = [];
        let addresses = [];

        if (isUUID(project)) {
          images = await client.images(project);
          addresses = await client.addresses(project);
        }
        if (isCurrent()) {
          this.projects = projects;
          this.images = images;
          this.addresses = addresses;
        }
      } catch (error) {
        if (isCurrent()) {
          this.errorCode = safeError(error).code;
        }
      } finally {
        if (isCurrent()) {
          this.loading = false;
        }
      }
    },
    selectProject(projectId) {
      if (projectId !== this.value.projectId) {
        this.value.imageId = '';
        this.value.publicIpId = '';
        this.value.sshAddress = 'private';
        this.networkMode = 'private';
        this.value.projectId = projectId;
      }
    },
    selectNetwork(mode) {
      this.networkMode = mode;
      if (mode === 'private') {
        this.value.publicIpId = '';
        this.value.sshAddress = 'private';
      }
    },
    async test() {
      if (this.mode === 'view') {
        return true;
      }
      const errors = Object.entries(this.fieldErrors).map(([field, code]) =>
        field === 'quantity' ? this.t('driver.clo.validation.quantity') :
          `${ this.t(`driver.clo.fields.${ field }`) }: ${ this.t(`driver.clo.validation.${ code }`) }`);

      if (!this.credentialId) {
        errors.push(this.t('driver.clo.errors.credentialRequired'));
      }
      if (!this.manual && this.loading) {
        errors.push(this.t('driver.clo.catalog.loading'));
      }
      if (!this.manual && this.errorCode) {
        errors.push(this.t(`driver.clo.errors.${ this.errorCode }`));
      }

      // Rancher's MachinePool host ignores a bare false, unlike credential hosts.
      return errors.length ? { errors } : true;
    },
  },
};
