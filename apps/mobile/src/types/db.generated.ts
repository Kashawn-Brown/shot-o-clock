export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_action_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["admin_action_type"]
          actor_permission_role: Database["public"]["Enums"]["player_permission_role"]
          actor_player_id: string
          affected_player_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          party_session_id: string
          previous_value: Json | null
          reason: string | null
          round_id: string | null
          round_number: number | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["admin_action_type"]
          actor_permission_role: Database["public"]["Enums"]["player_permission_role"]
          actor_player_id: string
          affected_player_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          party_session_id: string
          previous_value?: Json | null
          reason?: string | null
          round_id?: string | null
          round_number?: number | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["admin_action_type"]
          actor_permission_role?: Database["public"]["Enums"]["player_permission_role"]
          actor_player_id?: string
          affected_player_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          party_session_id?: string
          previous_value?: Json | null
          reason?: string | null
          round_id?: string | null
          round_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_action_logs_actor_player_id_fkey"
            columns: ["actor_player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_action_logs_affected_player_id_fkey"
            columns: ["affected_player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_action_logs_party_session_id_fkey"
            columns: ["party_session_id"]
            isOneToOne: false
            referencedRelation: "party_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_action_logs_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      party_player_notification_settings: {
        Row: {
          created_at: string
          id: string
          muted: boolean
          notification_only_mode: boolean
          party_player_id: string
          party_session_id: string
          persistent_timer_notification_enabled: boolean
          phone_notifications_enabled: boolean
          pre_shot_warning_enabled: boolean
          pre_shot_warning_seconds: number
          shot_start_notification_enabled: boolean
          sound_enabled: boolean
          updated_at: string
          vibration_enabled: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          muted?: boolean
          notification_only_mode?: boolean
          party_player_id: string
          party_session_id: string
          persistent_timer_notification_enabled?: boolean
          phone_notifications_enabled?: boolean
          pre_shot_warning_enabled?: boolean
          pre_shot_warning_seconds?: number
          shot_start_notification_enabled?: boolean
          sound_enabled?: boolean
          updated_at?: string
          vibration_enabled?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          muted?: boolean
          notification_only_mode?: boolean
          party_player_id?: string
          party_session_id?: string
          persistent_timer_notification_enabled?: boolean
          phone_notifications_enabled?: boolean
          pre_shot_warning_enabled?: boolean
          pre_shot_warning_seconds?: number
          shot_start_notification_enabled?: boolean
          sound_enabled?: boolean
          updated_at?: string
          vibration_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "party_player_notification_settings_party_player_id_fkey"
            columns: ["party_player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_player_notification_settings_party_session_id_fkey"
            columns: ["party_session_id"]
            isOneToOne: false
            referencedRelation: "party_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      party_players: {
        Row: {
          avatar_url: string | null
          created_at: string
          demoted_at: string | null
          display_name: string
          duty: Database["public"]["Enums"]["player_duty"]
          guest_identity_id: string | null
          id: string
          is_ready: boolean
          joined_at: string
          last_seen_at: string
          left_at: string | null
          out_at: string | null
          out_reason: Database["public"]["Enums"]["out_reason"] | null
          out_round_number: number | null
          party_session_id: string
          permission_role: Database["public"]["Enums"]["player_permission_role"]
          promoted_at: string | null
          promoted_by_player_id: string | null
          rejoined_at: string | null
          removed_at: string | null
          removed_by_player_id: string | null
          removed_reason: string | null
          status: Database["public"]["Enums"]["player_status"]
          total_missed_rounds: number
          total_pardons_received: number
          total_shots_completed: number
          updated_at: string
          used_grace: boolean
          used_grace_at: string | null
          used_grace_round_number: number | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          demoted_at?: string | null
          display_name: string
          duty?: Database["public"]["Enums"]["player_duty"]
          guest_identity_id?: string | null
          id?: string
          is_ready?: boolean
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          out_at?: string | null
          out_reason?: Database["public"]["Enums"]["out_reason"] | null
          out_round_number?: number | null
          party_session_id: string
          permission_role?: Database["public"]["Enums"]["player_permission_role"]
          promoted_at?: string | null
          promoted_by_player_id?: string | null
          rejoined_at?: string | null
          removed_at?: string | null
          removed_by_player_id?: string | null
          removed_reason?: string | null
          status?: Database["public"]["Enums"]["player_status"]
          total_missed_rounds?: number
          total_pardons_received?: number
          total_shots_completed?: number
          updated_at?: string
          used_grace?: boolean
          used_grace_at?: string | null
          used_grace_round_number?: number | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          demoted_at?: string | null
          display_name?: string
          duty?: Database["public"]["Enums"]["player_duty"]
          guest_identity_id?: string | null
          id?: string
          is_ready?: boolean
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          out_at?: string | null
          out_reason?: Database["public"]["Enums"]["out_reason"] | null
          out_round_number?: number | null
          party_session_id?: string
          permission_role?: Database["public"]["Enums"]["player_permission_role"]
          promoted_at?: string | null
          promoted_by_player_id?: string | null
          rejoined_at?: string | null
          removed_at?: string | null
          removed_by_player_id?: string | null
          removed_reason?: string | null
          status?: Database["public"]["Enums"]["player_status"]
          total_missed_rounds?: number
          total_pardons_received?: number
          total_shots_completed?: number
          updated_at?: string
          used_grace?: boolean
          used_grace_at?: string | null
          used_grace_round_number?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_players_party_session_id_fkey"
            columns: ["party_session_id"]
            isOneToOne: false
            referencedRelation: "party_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_players_promoted_by_player_id_fkey"
            columns: ["promoted_by_player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_players_removed_by_player_id_fkey"
            columns: ["removed_by_player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
        ]
      }
      party_sessions: {
        Row: {
          created_at: string
          current_phase: Database["public"]["Enums"]["party_phase"]
          current_round_number: number
          ended_at: string | null
          host_player_id: string | null
          id: string
          is_locked: boolean
          join_code: string
          join_code_expires_at: string | null
          name: string
          paused_at: string | null
          paused_remaining_seconds: number | null
          phase_ends_at: string | null
          phase_started_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["party_status"]
          total_paused_seconds: number
          updated_at: string
          visibility: Database["public"]["Enums"]["party_visibility"]
        }
        Insert: {
          created_at?: string
          current_phase?: Database["public"]["Enums"]["party_phase"]
          current_round_number?: number
          ended_at?: string | null
          host_player_id?: string | null
          id?: string
          is_locked?: boolean
          join_code: string
          join_code_expires_at?: string | null
          name: string
          paused_at?: string | null
          paused_remaining_seconds?: number | null
          phase_ends_at?: string | null
          phase_started_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["party_status"]
          total_paused_seconds?: number
          updated_at?: string
          visibility?: Database["public"]["Enums"]["party_visibility"]
        }
        Update: {
          created_at?: string
          current_phase?: Database["public"]["Enums"]["party_phase"]
          current_round_number?: number
          ended_at?: string | null
          host_player_id?: string | null
          id?: string
          is_locked?: boolean
          join_code?: string
          join_code_expires_at?: string | null
          name?: string
          paused_at?: string | null
          paused_remaining_seconds?: number | null
          phase_ends_at?: string | null
          phase_started_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["party_status"]
          total_paused_seconds?: number
          updated_at?: string
          visibility?: Database["public"]["Enums"]["party_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "party_sessions_host_player_id_fkey"
            columns: ["host_player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
        ]
      }
      party_settings: {
        Row: {
          admins_can_add_time: boolean
          admins_can_finalize_rounds: boolean
          admins_can_override_outcomes: boolean
          admins_can_pause_timer: boolean
          admins_can_remove_players: boolean
          allow_assigned_admins: boolean
          allow_guests: boolean
          allow_host_as_player: boolean
          allow_late_join: boolean
          allow_out_players_as_referees: boolean
          allow_player_opt_out: boolean
          allow_player_sound_override: boolean
          allow_questionable_verdict: boolean
          allow_rejoin: boolean
          auto_approve_if_all_players_done: boolean
          auto_approve_without_referee: boolean
          auto_start_delay_seconds: number
          auto_start_next_round: boolean
          created_at: string
          elimination_enabled: boolean
          grace_mode: Database["public"]["Enums"]["grace_mode"]
          host_review_required: boolean
          id: string
          interval_increment_seconds: number
          lock_party_on_start: boolean
          manual_pardons_enabled: boolean
          max_interval_seconds: number | null
          party_session_id: string
          persistent_timer_notification_enabled: boolean
          pre_shot_warning_enabled: boolean
          pre_shot_warning_seconds: number
          referee_confirmation_window_seconds: number
          referee_mode: Database["public"]["Enums"]["referee_mode"]
          require_age_confirmation: boolean
          require_referee_confirmation: boolean
          require_terms_acceptance: boolean
          session_sound_mode: Database["public"]["Enums"]["session_sound_mode"]
          shot_window_seconds: number
          starting_interval_seconds: number
          updated_at: string
        }
        Insert: {
          admins_can_add_time?: boolean
          admins_can_finalize_rounds?: boolean
          admins_can_override_outcomes?: boolean
          admins_can_pause_timer?: boolean
          admins_can_remove_players?: boolean
          allow_assigned_admins?: boolean
          allow_guests?: boolean
          allow_host_as_player?: boolean
          allow_late_join?: boolean
          allow_out_players_as_referees?: boolean
          allow_player_opt_out?: boolean
          allow_player_sound_override?: boolean
          allow_questionable_verdict?: boolean
          allow_rejoin?: boolean
          auto_approve_if_all_players_done?: boolean
          auto_approve_without_referee?: boolean
          auto_start_delay_seconds?: number
          auto_start_next_round?: boolean
          created_at?: string
          elimination_enabled?: boolean
          grace_mode?: Database["public"]["Enums"]["grace_mode"]
          host_review_required?: boolean
          id?: string
          interval_increment_seconds?: number
          lock_party_on_start?: boolean
          manual_pardons_enabled?: boolean
          max_interval_seconds?: number | null
          party_session_id: string
          persistent_timer_notification_enabled?: boolean
          pre_shot_warning_enabled?: boolean
          pre_shot_warning_seconds?: number
          referee_confirmation_window_seconds?: number
          referee_mode?: Database["public"]["Enums"]["referee_mode"]
          require_age_confirmation?: boolean
          require_referee_confirmation?: boolean
          require_terms_acceptance?: boolean
          session_sound_mode?: Database["public"]["Enums"]["session_sound_mode"]
          shot_window_seconds: number
          starting_interval_seconds: number
          updated_at?: string
        }
        Update: {
          admins_can_add_time?: boolean
          admins_can_finalize_rounds?: boolean
          admins_can_override_outcomes?: boolean
          admins_can_pause_timer?: boolean
          admins_can_remove_players?: boolean
          allow_assigned_admins?: boolean
          allow_guests?: boolean
          allow_host_as_player?: boolean
          allow_late_join?: boolean
          allow_out_players_as_referees?: boolean
          allow_player_opt_out?: boolean
          allow_player_sound_override?: boolean
          allow_questionable_verdict?: boolean
          allow_rejoin?: boolean
          auto_approve_if_all_players_done?: boolean
          auto_approve_without_referee?: boolean
          auto_start_delay_seconds?: number
          auto_start_next_round?: boolean
          created_at?: string
          elimination_enabled?: boolean
          grace_mode?: Database["public"]["Enums"]["grace_mode"]
          host_review_required?: boolean
          id?: string
          interval_increment_seconds?: number
          lock_party_on_start?: boolean
          manual_pardons_enabled?: boolean
          max_interval_seconds?: number | null
          party_session_id?: string
          persistent_timer_notification_enabled?: boolean
          pre_shot_warning_enabled?: boolean
          pre_shot_warning_seconds?: number
          referee_confirmation_window_seconds?: number
          referee_mode?: Database["public"]["Enums"]["referee_mode"]
          require_age_confirmation?: boolean
          require_referee_confirmation?: boolean
          require_terms_acceptance?: boolean
          session_sound_mode?: Database["public"]["Enums"]["session_sound_mode"]
          shot_window_seconds?: number
          starting_interval_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_settings_party_session_id_fkey"
            columns: ["party_session_id"]
            isOneToOne: true
            referencedRelation: "party_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      round_player_outcomes: {
        Row: {
          created_at: string
          eliminated_this_round: boolean
          final_outcome: Database["public"]["Enums"]["final_outcome"]
          finalized_at: string | null
          finalized_by_player_id: string | null
          grace_applied: boolean
          grace_applied_at: string | null
          id: string
          notes: string | null
          pardoned: boolean
          pardoned_at: string | null
          pardoned_by_player_id: string | null
          party_player_id: string
          party_session_id: string
          player_action: Database["public"]["Enums"]["player_action"]
          player_marked_self_out_at: string | null
          player_tapped_done_at: string | null
          referee_player_id: string | null
          referee_verdict: Database["public"]["Enums"]["referee_verdict"]
          referee_verdict_at: string | null
          round_id: string
          round_number: number
          status_after_round:
            | Database["public"]["Enums"]["player_status"]
            | null
          status_before_round:
            | Database["public"]["Enums"]["player_status"]
            | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          eliminated_this_round?: boolean
          final_outcome?: Database["public"]["Enums"]["final_outcome"]
          finalized_at?: string | null
          finalized_by_player_id?: string | null
          grace_applied?: boolean
          grace_applied_at?: string | null
          id?: string
          notes?: string | null
          pardoned?: boolean
          pardoned_at?: string | null
          pardoned_by_player_id?: string | null
          party_player_id: string
          party_session_id: string
          player_action?: Database["public"]["Enums"]["player_action"]
          player_marked_self_out_at?: string | null
          player_tapped_done_at?: string | null
          referee_player_id?: string | null
          referee_verdict?: Database["public"]["Enums"]["referee_verdict"]
          referee_verdict_at?: string | null
          round_id: string
          round_number: number
          status_after_round?:
            | Database["public"]["Enums"]["player_status"]
            | null
          status_before_round?:
            | Database["public"]["Enums"]["player_status"]
            | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          eliminated_this_round?: boolean
          final_outcome?: Database["public"]["Enums"]["final_outcome"]
          finalized_at?: string | null
          finalized_by_player_id?: string | null
          grace_applied?: boolean
          grace_applied_at?: string | null
          id?: string
          notes?: string | null
          pardoned?: boolean
          pardoned_at?: string | null
          pardoned_by_player_id?: string | null
          party_player_id?: string
          party_session_id?: string
          player_action?: Database["public"]["Enums"]["player_action"]
          player_marked_self_out_at?: string | null
          player_tapped_done_at?: string | null
          referee_player_id?: string | null
          referee_verdict?: Database["public"]["Enums"]["referee_verdict"]
          referee_verdict_at?: string | null
          round_id?: string
          round_number?: number
          status_after_round?:
            | Database["public"]["Enums"]["player_status"]
            | null
          status_before_round?:
            | Database["public"]["Enums"]["player_status"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_player_outcomes_finalized_by_player_id_fkey"
            columns: ["finalized_by_player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_player_outcomes_pardoned_by_player_id_fkey"
            columns: ["pardoned_by_player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_player_outcomes_party_player_id_fkey"
            columns: ["party_player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_player_outcomes_party_session_id_fkey"
            columns: ["party_session_id"]
            isOneToOne: false
            referencedRelation: "party_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_player_outcomes_referee_player_id_fkey"
            columns: ["referee_player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_player_outcomes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          completed_at: string | null
          countdown_ends_at: string | null
          countdown_started_at: string | null
          created_at: string
          id: string
          interval_seconds: number
          party_session_id: string
          referee_confirmation_window_seconds: number
          referee_window_ends_at: string | null
          referee_window_started_at: string | null
          round_number: number
          shot_window_ends_at: string | null
          shot_window_seconds: number
          shot_window_started_at: string | null
          status: Database["public"]["Enums"]["round_status"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          countdown_ends_at?: string | null
          countdown_started_at?: string | null
          created_at?: string
          id?: string
          interval_seconds: number
          party_session_id: string
          referee_confirmation_window_seconds?: number
          referee_window_ends_at?: string | null
          referee_window_started_at?: string | null
          round_number: number
          shot_window_ends_at?: string | null
          shot_window_seconds: number
          shot_window_started_at?: string | null
          status?: Database["public"]["Enums"]["round_status"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          countdown_ends_at?: string | null
          countdown_started_at?: string | null
          created_at?: string
          id?: string
          interval_seconds?: number
          party_session_id?: string
          referee_confirmation_window_seconds?: number
          referee_window_ends_at?: string | null
          referee_window_started_at?: string | null
          round_number?: number
          shot_window_ends_at?: string | null
          shot_window_seconds?: number
          shot_window_started_at?: string | null
          status?: Database["public"]["Enums"]["round_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_party_session_id_fkey"
            columns: ["party_session_id"]
            isOneToOne: false
            referencedRelation: "party_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      timer_events: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["timer_event_type"]
          id: string
          new_ends_at: string | null
          new_phase: Database["public"]["Enums"]["party_phase"] | null
          party_session_id: string
          previous_ends_at: string | null
          previous_phase: Database["public"]["Enums"]["party_phase"] | null
          round_id: string | null
          round_number: number | null
          seconds_added: number | null
          triggered_by: Database["public"]["Enums"]["triggered_by"]
          triggered_by_player_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["timer_event_type"]
          id?: string
          new_ends_at?: string | null
          new_phase?: Database["public"]["Enums"]["party_phase"] | null
          party_session_id: string
          previous_ends_at?: string | null
          previous_phase?: Database["public"]["Enums"]["party_phase"] | null
          round_id?: string | null
          round_number?: number | null
          seconds_added?: number | null
          triggered_by: Database["public"]["Enums"]["triggered_by"]
          triggered_by_player_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["timer_event_type"]
          id?: string
          new_ends_at?: string | null
          new_phase?: Database["public"]["Enums"]["party_phase"] | null
          party_session_id?: string
          previous_ends_at?: string | null
          previous_phase?: Database["public"]["Enums"]["party_phase"] | null
          round_id?: string | null
          round_number?: number | null
          seconds_added?: number | null
          triggered_by?: Database["public"]["Enums"]["triggered_by"]
          triggered_by_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timer_events_party_session_id_fkey"
            columns: ["party_session_id"]
            isOneToOne: false
            referencedRelation: "party_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timer_events_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timer_events_triggered_by_player_id_fkey"
            columns: ["triggered_by_player_id"]
            isOneToOne: false
            referencedRelation: "party_players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _rpc_error: { Args: { code: string; msg: string }; Returns: Json }
      _rpc_success: { Args: { data?: Json }; Returns: Json }
      create_party: {
        Args: {
          p_elimination_enabled: boolean
          p_grace_mode: Database["public"]["Enums"]["grace_mode"]
          p_host_display_name: string
          p_interval_increment_secs: number
          p_party_name: string
          p_shot_window_secs: number
          p_starting_interval_secs: number
        }
        Returns: Json
      }
      end_party: { Args: { p_party_session_id: string }; Returns: Json }
      get_party_state: { Args: { p_party_session_id: string }; Returns: Json }
      get_round_outcomes: { Args: { p_round_id: string }; Returns: Json }
      get_server_time: { Args: never; Returns: Json }
      is_active_party_member: { Args: { session_id: string }; Returns: boolean }
      is_party_host: { Args: { session_id: string }; Returns: boolean }
      is_party_member: { Args: { session_id: string }; Returns: boolean }
      join_party: {
        Args: { p_display_name: string; p_join_code: string }
        Returns: Json
      }
      leave_party: { Args: { p_party_session_id: string }; Returns: Json }
      my_party_player_id: { Args: { session_id: string }; Returns: string }
    }
    Enums: {
      admin_action_type:
        | "pause_timer"
        | "resume_timer"
        | "add_time"
        | "skip_to_shot_window"
        | "end_shot_window"
        | "finalize_round"
        | "override_outcome"
        | "mark_player_out"
        | "mark_player_active"
        | "reinstate_player"
        | "give_pardon"
        | "remove_pardon"
        | "reset_grace_used"
        | "remove_player"
        | "promote_admin"
        | "demote_admin"
        | "lock_party"
        | "unlock_party"
        | "transfer_host"
        | "end_party"
      album_visibility: "party_only" | "host_only" | "shared_link"
      alert_mode: "sound" | "vibration" | "notification_only" | "muted"
      assignment_status: "assigned" | "completed" | "skipped" | "expired"
      assignment_type: "assigned_monitor" | "referee_pool_claim"
      device_platform: "ios" | "android" | "web"
      final_outcome:
        | "pending"
        | "completed"
        | "missed"
        | "grace_used"
        | "pardoned"
        | "out"
        | "self_out"
        | "overridden"
      grace_mode: "disabled" | "enabled" | "unlimited"
      media_report_reason: "inappropriate" | "privacy" | "harassment" | "other"
      media_report_status: "open" | "reviewed" | "dismissed" | "action_taken"
      media_type: "photo" | "video"
      moderation_status: "visible" | "pending_review" | "removed" | "reported"
      notification_permission_status:
        | "granted"
        | "denied"
        | "provisional"
        | "unknown"
      out_reason:
        | "missed_round"
        | "self_opted_out"
        | "host_marked_out"
        | "missed_after_grace"
        | "left_game"
      party_phase:
        | "lobby"
        | "countdown"
        | "shot_window"
        | "referee_confirmation"
        | "host_review"
        | "round_complete"
        | "ended"
      party_status:
        | "lobby"
        | "active"
        | "paused"
        | "ended"
        | "expired"
        | "cancelled"
      party_visibility: "invite_code_only" | "private"
      player_action: "none" | "done" | "self_out" | "missed"
      player_duty:
        | "normal_player"
        | "assigned_monitor"
        | "referee_pool"
        | "spectator"
      player_permission_role: "host" | "admin" | "player"
      player_status: "active" | "out" | "removed"
      referee_mode: "none" | "assigned_monitor" | "referee_pool"
      referee_verdict:
        | "pending"
        | "confirmed"
        | "missed"
        | "questionable"
        | "not_required"
      removed_player_reason:
        | "host_kicked"
        | "self_left_lobby"
        | "inactive"
        | "other"
      round_status:
        | "scheduled"
        | "countdown"
        | "shot_window"
        | "referee_confirmation"
        | "host_review"
        | "completed"
        | "skipped"
        | "cancelled"
      session_sound_mode: "host_only" | "everyone" | "muted" | "vibration_only"
      timer_event_type:
        | "countdown_started"
        | "shot_window_started"
        | "referee_window_started"
        | "timer_paused"
        | "timer_resumed"
        | "time_added"
        | "phase_skipped"
        | "round_completed"
        | "round_cancelled"
        | "next_round_started"
      triggered_by: "system" | "host" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_action_type: [
        "pause_timer",
        "resume_timer",
        "add_time",
        "skip_to_shot_window",
        "end_shot_window",
        "finalize_round",
        "override_outcome",
        "mark_player_out",
        "mark_player_active",
        "reinstate_player",
        "give_pardon",
        "remove_pardon",
        "reset_grace_used",
        "remove_player",
        "promote_admin",
        "demote_admin",
        "lock_party",
        "unlock_party",
        "transfer_host",
        "end_party",
      ],
      album_visibility: ["party_only", "host_only", "shared_link"],
      alert_mode: ["sound", "vibration", "notification_only", "muted"],
      assignment_status: ["assigned", "completed", "skipped", "expired"],
      assignment_type: ["assigned_monitor", "referee_pool_claim"],
      device_platform: ["ios", "android", "web"],
      final_outcome: [
        "pending",
        "completed",
        "missed",
        "grace_used",
        "pardoned",
        "out",
        "self_out",
        "overridden",
      ],
      grace_mode: ["disabled", "enabled", "unlimited"],
      media_report_reason: ["inappropriate", "privacy", "harassment", "other"],
      media_report_status: ["open", "reviewed", "dismissed", "action_taken"],
      media_type: ["photo", "video"],
      moderation_status: ["visible", "pending_review", "removed", "reported"],
      notification_permission_status: [
        "granted",
        "denied",
        "provisional",
        "unknown",
      ],
      out_reason: [
        "missed_round",
        "self_opted_out",
        "host_marked_out",
        "missed_after_grace",
        "left_game",
      ],
      party_phase: [
        "lobby",
        "countdown",
        "shot_window",
        "referee_confirmation",
        "host_review",
        "round_complete",
        "ended",
      ],
      party_status: [
        "lobby",
        "active",
        "paused",
        "ended",
        "expired",
        "cancelled",
      ],
      party_visibility: ["invite_code_only", "private"],
      player_action: ["none", "done", "self_out", "missed"],
      player_duty: [
        "normal_player",
        "assigned_monitor",
        "referee_pool",
        "spectator",
      ],
      player_permission_role: ["host", "admin", "player"],
      player_status: ["active", "out", "removed"],
      referee_mode: ["none", "assigned_monitor", "referee_pool"],
      referee_verdict: [
        "pending",
        "confirmed",
        "missed",
        "questionable",
        "not_required",
      ],
      removed_player_reason: [
        "host_kicked",
        "self_left_lobby",
        "inactive",
        "other",
      ],
      round_status: [
        "scheduled",
        "countdown",
        "shot_window",
        "referee_confirmation",
        "host_review",
        "completed",
        "skipped",
        "cancelled",
      ],
      session_sound_mode: ["host_only", "everyone", "muted", "vibration_only"],
      timer_event_type: [
        "countdown_started",
        "shot_window_started",
        "referee_window_started",
        "timer_paused",
        "timer_resumed",
        "time_added",
        "phase_skipped",
        "round_completed",
        "round_cancelled",
        "next_round_started",
      ],
      triggered_by: ["system", "host", "admin"],
    },
  },
} as const

