/**
 * Central interaction router.
 *
 * Dispatches buttons, select menus, and modals for the announcement
 * workflow, setup menus, and history/audit pagination. Every handler
 * re-validates authorization inside the handler — command visibility is
 * never trusted as the only gate.
 */
const { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { emoji } = require('../config/emojis');
const { COLORS, embed } = require('../config/theme');
const { buildAnnouncementModal, extractModalFields } = require('./announcementModal');
const { buildPreviewPayload } = require('../services/announcementService');
const {
  validateTitle, validateDescription, validateBannerUrl, validateAttachment, validationErrorEmbed,
} = require('../utils/validators');
const { respondWithError, logError } = require('../utils/errorHandler');
const { checkAuthorization } = require('../services/authorization');
const { truncate, formatDuration, formatPercent, discordTimestamp } = require('../utils/formatters');
const { broadcastEmbed } = require('../services/broadcastEngine');

const SETUP_PREFIX = 'setup:';
const HISTORY_PREFIX = 'history:';
const AUDIT_PREFIX = 'audit:';

class InteractionHandler {
  constructor({ database, announcementService, broadcastEngine, dmOptIn, auditService, commands }) {
    this.db = database;
    this.announcements = announcementService;
    this.engine = broadcastEngine;
    this.dmOptIn = dmOptIn;
    this.audit = auditService;
    this.commands = commands;
  }

  async handle(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        await this.#handleCommand(interaction);
        return;
      }
      if (interaction.isButton()) {
        await this.#handleButton(interaction);
        return;
      }
      if (interaction.isStringSelectMenu()) {
        await this.#handleSelectMenu(interaction);
        return;
      }
      if (interaction.isModalSubmit()) {
        await this.#handleModalSubmit(interaction);
        return;
      }
    } catch (error) {
      await respondWithError(interaction, 'interactionHandler', error);
    }
  }

  async #handleCommand(interaction) {
    const command = this.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({
        embeds: [new EmbedBuilder(embed(COLORS.danger, {
          title: `${emoji('ERROR')}  Unknown Command`,
          description: 'That command is not registered. The bot may need a moment to finish updating.',
        }))],
        ephemeral: true,
      });
      return;
    }
    await command.execute(interaction, this.#context());
  }

  #context() {
    return {
      database: this.db,
      dmOptIn: this.dmOptIn,
      commands: this.commands,
    };
  }

  // ------------------------------------------------------------------
  // Buttons
  // ------------------------------------------------------------------

  async #handleButton(interaction) {
    const customId = interaction.customId;

    if (customId === 'announce:open') {
      await this.#handleOpenCreate(interaction);
      return;
    }

    if (customId.startsWith('announce:send:')) {
      await this.#handleSend(interaction);
      return;
    }

    if (customId.startsWith('announce:cancel:')) {
      await this.#handleCancel(interaction);
      return;
    }

    if (customId.startsWith(HISTORY_PREFIX)) {
      await this.#handleHistoryPage(interaction);
      return;
    }

    if (customId.startsWith(AUDIT_PREFIX)) {
      await this.#handleAuditPage(interaction);
      return;
    }

    logError('button.unknown', new Error(`No handler for customId ${customId}`));
  }

  async #handleOpenCreate(interaction) {
    const guildConfig = this.db.getGuildConfig(interaction.guildId);
    const auth = checkAuthorization(interaction, guildConfig, 'create an announcement');
    if (!auth.ok) {
      await interaction.reply({ ...auth.reply, ephemeral: true });
      return;
    }
    await interaction.showModal(buildAnnouncementModal());
  }

  async #handleSend(interaction) {
    const creatorId = interaction.customId.split(':')[2];
    if (interaction.user.id !== creatorId) {
      await interaction.reply({
        embeds: [new EmbedBuilder(embed(COLORS.danger, {
          title: `${emoji('DENIED')}  Not Your Preview`,
          description: 'Only the administrator who created this preview can send it.',
        }))],
        ephemeral: true,
      });
      return;
    }

    const guildConfig = this.db.getGuildConfig(interaction.guildId);
    const auth = checkAuthorization(interaction, guildConfig, 'send announcements');
    if (!auth.ok) {
      await interaction.reply({ ...auth.reply, ephemeral: true });
      return;
    }

    // The announcement to send is looked up from the most recent staged
    // record by this creator in this guild that is still pending.
    const pending = this.db.listAnnouncements({ status: 'pending', limit: 25 })
      .items
      .filter((a) => a.creatorId === creatorId && a.guildId === interaction.guildId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

    if (!pending) {
      await interaction.update({
        embeds: [new EmbedBuilder(embed(COLORS.warning, {
          title: `${emoji('WARNING')}  Preview Expired`,
          description: 'This preview is no longer valid. Start again with **Create Announcement**.',
        }))],
        components: [],
      });
      return;
    }

    await interaction.deferUpdate();

    try {
      const { announcement } = await this.announcements.confirmAndSend(interaction, pending.id);
      await interaction.editReply({
        embeds: [this.announcements.resultEmbed(announcement)],
        components: [],
      });
    } catch (error) {
      // The broadcast failed before anything was sent; surface it cleanly.
      await interaction.editReply({
        embeds: [new EmbedBuilder(embed(COLORS.danger, {
          title: `${emoji('ERROR')}  Broadcast Failed`,
          description: error.userMessage ?? 'The announcement could not be delivered. Nothing was posted. Please try again.',
        }))],
        components: [],
      });
      logError('announce.send', error);
    }
  }

  async #handleCancel(interaction) {
    const creatorId = interaction.customId.split(':')[2];
    if (interaction.user.id !== creatorId) {
      await interaction.reply({
        embeds: [new EmbedBuilder(embed(COLORS.danger, {
          title: `${emoji('DENIED')}  Not Your Preview`,
          description: 'Only the administrator who created this preview can cancel it.',
        }))],
        ephemeral: true,
      });
      return;
    }

    const pending = this.db.listAnnouncements({ status: 'pending', limit: 25 })
      .items
      .filter((a) => a.creatorId === creatorId && a.guildId === interaction.guildId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

    if (pending) {
      try {
        this.announcements.cancel(pending.id, interaction.user.id);
      } catch (error) {
        logError('announce.cancel', error);
      }
    }

    await interaction.update({
      embeds: [new EmbedBuilder(embed(COLORS.neutral, {
        title: `${emoji('CANCEL')}  Announcement Cancelled`,
        description: 'Nothing was sent. Your draft was safely discarded.',
      }))],
      components: [],
    });
  }

  // ------------------------------------------------------------------
  // Select menus (setup)
  // ------------------------------------------------------------------

  async #handleSelectMenu(interaction) {
    if (!interaction.customId.startsWith(SETUP_PREFIX)) return;

    const guildConfig = this.db.getGuildConfig(interaction.guildId);
    const auth = checkAuthorization(interaction, guildConfig, 'change bot settings');
    if (!auth.ok) {
      await interaction.reply({ ...auth.reply, ephemeral: true });
      return;
    }

    const choice = interaction.values[0];
    const { configOverviewEmbed } = require('../commands/setup');

    if (choice === 'dm') {
      const enabled = !guildConfig?.dmDeliveryEnabled;
      const updated = this.db.upsertGuildConfig(interaction.guildId, { dmDeliveryEnabled: enabled });
      this.audit.log({
        actorId: interaction.user.id,
        action: 'CONFIG_UPDATED',
        guildId: interaction.guildId,
        metadata: { setting: 'dmDeliveryEnabled', value: enabled },
      });
      await interaction.update({
        embeds: [
          configOverviewEmbed(updated, interaction.guild),
          new EmbedBuilder(embed(COLORS.success, {
            title: `${emoji('SUCCESS')}  DM Delivery ${enabled ? 'Enabled' : 'Disabled'}`,
            description: enabled
              ? 'Announcements will be delivered by DM to members who opted in with `/announce-dm opt-in`. Channel delivery is unaffected.'
              : 'Announcement DM delivery is now off. Channel broadcasts continue as usual.',
          })),
        ],
        components: [],
      });
      return;
    }

    // Channel/role settings require a follow-up prompt modal so the
    // administrator can paste the ID (Discord select menus of channels
    // are handled in the modal-free flow below via /setup arguments).
    const prompts = {
      panel: { label: 'Panel channel ID', key: 'panelChannelId' },
      announcement: { label: 'Announcement channel ID', key: 'announcementChannelId' },
      role: { label: 'Authorized role ID', key: 'authorizedRoleId' },
      ping: { label: 'Announcement ping role ID', key: 'announcementRoleId' },
    };
    const prompt = prompts[choice];
    if (!prompt) return;

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`${SETUP_PREFIX}submit:${choice}`)
        .setTitle('Configure Setting')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('entityId')
              .setLabel(prompt.label)
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder('Paste the ID here (enable Developer Mode to copy IDs)'),
          ),
        ),
    );
  }

  // ------------------------------------------------------------------
  // Modal submissions
  // ------------------------------------------------------------------

  async #handleModalSubmit(interaction) {
    if (interaction.customId === 'announcementModal') {
      await this.#handleAnnouncementModal(interaction);
      return;
    }
    if (interaction.customId.startsWith(`${SETUP_PREFIX}submit:`)) {
      await this.#handleSetupSubmit(interaction);
      return;
    }
  }

  async #handleAnnouncementModal(interaction) {
    const guildConfig = this.db.getGuildConfig(interaction.guildId);
    const auth = checkAuthorization(interaction, guildConfig, 'create an announcement');
    if (!auth.ok) {
      await interaction.reply({ ...auth.reply, ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const fields = extractModalFields(interaction);

    const titleResult = validateTitle(fields.title);
    if (!titleResult.ok) {
      await interaction.editReply({ embeds: [validationErrorEmbed(titleResult.error)] });
      return;
    }
    const descriptionResult = validateDescription(fields.description);
    if (!descriptionResult.ok) {
      await interaction.editReply({ embeds: [validationErrorEmbed(descriptionResult.error)] });
      return;
    }
    const bannerResult = validateBannerUrl(fields.bannerURL);
    if (!bannerResult.ok) {
      await interaction.editReply({ embeds: [validationErrorEmbed(bannerResult.error)] });
      return;
    }
    const attachmentResult = validateAttachment(fields.attachmentURL);
    if (!attachmentResult.ok) {
      await interaction.editReply({ embeds: [validationErrorEmbed(attachmentResult.error)] });
      return;
    }

    const guildConfigAfter = this.db.getGuildConfig(interaction.guildId);
    const announcementChannelId = guildConfigAfter?.announcementChannelId;
    const destinationLabel = announcementChannelId
      ? `<#${announcementChannelId}>`
      : '*announcement channel not configured*';

    try {
      const announcement = await this.announcements.stageAnnouncement({
        title: titleResult.value,
        description: descriptionResult.value,
        bannerURL: bannerResult.value,
        attachment: attachmentResult.value,
        creator: interaction.user,
        guildId: interaction.guildId,
        destinationLabel,
      });

      const payload = buildPreviewPayload({
        title: titleResult.value,
        description: descriptionResult.value,
        bannerURL: bannerResult.value,
        attachment: attachmentResult.value,
        creator: interaction.user,
        destinationLabel,
      });

      await interaction.editReply(payload);
    } catch (error) {
      if (error.code === 'DUPLICATE_ANNOUNCEMENT') {
        await interaction.editReply({
          embeds: [new EmbedBuilder(embed(COLORS.warning, {
            title: `${emoji('WARNING')}  Duplicate Announcement`,
            description: error.userMessage,
          }))],
        });
        return;
      }
      throw error;
    }
  }

  async #handleSetupSubmit(interaction) {
    const guildConfig = this.db.getGuildConfig(interaction.guildId);
    const auth = checkAuthorization(interaction, guildConfig, 'change bot settings');
    if (!auth.ok) {
      await interaction.reply({ ...auth.reply, ephemeral: true });
      return;
    }

    const choice = interaction.customId.split(':')[2];
    const rawId = interaction.fields.getTextInputValue('entityId').trim();
    const snowflake = /^\d{17,20}$/.exec(rawId);

    const settingMap = {
      panel: 'panelChannelId',
      announcement: 'announcementChannelId',
      role: 'authorizedRoleId',
      ping: 'announcementRoleId',
    };
    const field = settingMap[choice];
    if (!field) return;

    if (!snowflake) {
      await interaction.reply({
        embeds: [new EmbedBuilder(embed(COLORS.danger, {
          title: `${emoji('ERROR')}  Invalid ID`,
          description: `\`${truncate(rawId, 60)}\` is not a valid Discord ID. Enable **Developer Mode** in Discord settings, then right-click the channel or role and choose **Copy ID**.`,
        }))],
        ephemeral: true,
      });
      return;
    }

    // Verify the entity actually exists in this guild.
    let exists = false;
    if (choice === 'panel' || choice === 'announcement') {
      exists = Boolean(interaction.guild.channels.cache.get(rawId));
    } else {
      exists = Boolean(interaction.guild.roles.cache.get(rawId));
    }
    if (!exists) {
      await interaction.reply({
        embeds: [new EmbedBuilder(embed(COLORS.danger, {
          title: `${emoji('ERROR')}  Not Found`,
          description: `That ID does not match any ${choice === 'panel' || choice === 'announcement' ? 'channel' : 'role'} in this server.`,
        }))],
        ephemeral: true,
      });
      return;
    }

    const updated = this.db.upsertGuildConfig(interaction.guildId, { [field]: rawId });
    this.audit.log({
      actorId: interaction.user.id,
      action: 'CONFIG_UPDATED',
      guildId: interaction.guildId,
      metadata: { setting: field, value: rawId },
    });

    const { configOverviewEmbed } = require('../commands/setup');
    await interaction.reply({
      embeds: [
        configOverviewEmbed(updated, interaction.guild),
        new EmbedBuilder(embed(COLORS.success, {
          title: `${emoji('SUCCESS')}  Setting Saved`,
          description: `The configuration change is now live.`,
        })),
      ],
      ephemeral: true,
    });
  }

  // ------------------------------------------------------------------
  // Pagination
  // ------------------------------------------------------------------

  async #handleHistoryPage(interaction) {
    const parts = interaction.customId.split(':'); // history:action:page:filter
    const action = parts[1];
    const currentPage = parseInt(parts[2], 10) || 0;
    const filter = parts[3] || 'all';

    const guildConfig = this.db.getGuildConfig(interaction.guildId);
    const auth = checkAuthorization(interaction, guildConfig, 'view announcement history');
    if (!auth.ok) {
      await interaction.reply({ ...auth.reply, ephemeral: true });
      return;
    }

    let page = currentPage;
    if (action === 'first') page = 0;
    if (action === 'prev') page = Math.max(0, currentPage - 1);
    if (action === 'next') page = currentPage + 1;
    if (action === 'last') page = Number.MAX_SAFE_INTEGER;

    const { buildHistoryPayload } = require('../commands/announcement-history');
    const totalItems = this.db.listAnnouncements({
      status: filter === 'all' ? undefined : filter,
      limit: 1000,
    }).total;
    const totalPages = Math.max(1, Math.ceil(totalItems / 5));
    if (action === 'last') page = totalPages - 1;
    page = Math.min(page, totalPages - 1);

    const payload = buildHistoryPayload(this.#context(), { filter, page, authorized: true });
    await interaction.update(payload);
  }

  async #handleAuditPage(interaction) {
    const parts = interaction.customId.split(':'); // audit:action:page
    const action = parts[1];
    const currentPage = parseInt(parts[2], 10) || 0;

    const guildConfig = this.db.getGuildConfig(interaction.guildId);
    const auth = checkAuthorization(interaction, guildConfig, 'view the audit log');
    if (!auth.ok) {
      await interaction.reply({ ...auth.reply, ephemeral: true });
      return;
    }

    const { buildAuditPayload, PAGE_SIZE } = require('../commands/audit');
    const totalItems = this.db.listAuditLogs({ limit: 1000 }).total;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

    let page = currentPage;
    if (action === 'first') page = 0;
    if (action === 'prev') page = Math.max(0, currentPage - 1);
    if (action === 'next') page = Math.min(totalPages - 1, currentPage + 1);
    if (action === 'last') page = totalPages - 1;

    const payload = buildAuditPayload(this.#context(), { page });
    await interaction.update(payload);
  }
}

module.exports = { InteractionHandler };
